// Merged transfer-request endpoints for the staff dashboard.
// Serves (via vercel.json rewrites, op query parameter):
//   /api/admin-transfers              list transfer requests (default)
//   /api/admin-transfer-review?op=review  decide on a transfer request
// Authorization: Bearer <token> (see _auth.js). The transfer
// itself is processed offline by the bank; no money ever moves
// through this site. Required environment variable: DATABASE_URL.
// Optional email: see _mail.js.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const { notifyTransferDecision } = require('./_mail');

const LIST_COLUMNS =
  'id, reference, sender_name, sender_email, sender_phone, account_number, ' +
  'destination_bank, destination_region, destination_country, recipient_name, ' +
  'recipient_account, amount, currency, purpose, status, admin_note, created_at, reviewed_at';

// The client_approved and is_manual_bank columns arrive with the 2026-11-05
// client-portal migration (sql/migrations/2026-11-05-client-portal.sql).
// Until it has run, the list still works and both flags read as false.
async function transferColumns(pool) {
  try {
    const probe = await pool.query(
      "SELECT column_name FROM information_schema.columns " +
        "WHERE table_name = 'transfer_requests' AND column_name IN ('client_approved', 'is_manual_bank')"
    );
    const found = {};
    probe.rows.forEach(function (row) { found[row.column_name] = true; });
    return {
      client_approved: found.client_approved
        ? 'client_approved'
        : 'false AS client_approved',
      is_manual_bank: found.is_manual_bank
        ? 'is_manual_bank'
        : 'false AS is_manual_bank'
    };
  } catch (e) {
    return {
      client_approved: 'false AS client_approved',
      is_manual_bank: 'false AS is_manual_bank'
    };
  }
}

const SORTABLE = {
  created_at: 'created_at',
  reference: 'reference',
  amount: 'amount'
};

const STATUSES = ['pending', 'approved', 'rejected'];
const REGIONS = ['africa', 'europe', 'america', 'asia'];

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const DECISIONS = ['approved', 'rejected'];

async function handleTransfersList(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const q = req.query || {};
  const status = STATUSES.indexOf(clean(q.status)) !== -1 ? clean(q.status) : null;
  const region = REGIONS.indexOf(clean(q.region)) !== -1 ? clean(q.region) : null;
  const search = clean(q.search);
  const sort = SORTABLE[clean(q.sort)] || 'created_at';
  const order = clean(q.order) === 'asc' ? 'ASC' : 'DESC';
  const perPage = Math.min(Math.max(parseInt(clean(q.per_page), 10) || 20, 1), 100);
  const page = Math.max(parseInt(clean(q.page), 10) || 1, 1);

  const where = [];
  const params = [];
  if (status) { params.push(status); where.push('status = $' + params.length); }
  if (region) { params.push(region); where.push('destination_region = $' + params.length); }
  if (search) {
    params.push('%' + search.replace(/[%_]/g, '') + '%');
    where.push("(sender_name ILIKE $" + params.length +
      " OR reference ILIKE $" + params.length +
      " OR destination_bank ILIKE $" + params.length + ')');
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const statsResult = await pool.query(
      'SELECT ' +
        'COUNT(*)::int AS total, ' +
        "COUNT(*) FILTER (WHERE status = 'pending')::int AS pending, " +
        "COUNT(*) FILTER (WHERE status = 'approved')::int AS approved, " +
        "COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected " +
        'FROM transfer_requests'
    );
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM transfer_requests ' + whereSql,
      params
    );
    const totalCount = countResult.rows[0].total;
    const totalPages = Math.max(Math.ceil(totalCount / perPage), 1);
    const safePage = Math.min(page, totalPages);
    const listParams = params.slice();
    listParams.push(perPage);
    listParams.push((safePage - 1) * perPage);
    const extraColumns = await transferColumns(pool);
    const listResult = await pool.query(
      'SELECT ' + LIST_COLUMNS + ', ' + extraColumns.client_approved + ', ' +
        extraColumns.is_manual_bank + ' FROM transfer_requests ' + whereSql +
        ' ORDER BY ' + sort + ' ' + order + ', id DESC' +
        ' LIMIT $' + (listParams.length - 1) + ' OFFSET $' + listParams.length,
      listParams
    );
    return res.status(200).json({
      ok: true,
      stats: statsResult.rows[0],
      transfers: listResult.rows,
      page: safePage,
      per_page: perPage,
      total_count: totalCount,
      total_pages: totalPages
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleTransferReview(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const id = parseInt(body.id, 10);
  const decision = typeof body.decision === 'string' ? body.decision.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!id || DECISIONS.indexOf(decision) === -1) {
    return res.status(400).json({ ok: false, error: 'invalid_fields' });
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT id, reference, sender_name, sender_email, destination_bank, ' +
        'destination_country, amount, currency, status FROM transfer_requests WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = current.rows[0];
    if (row.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'invalid_transition' });
    }
    await client.query(
      'UPDATE transfer_requests SET status = $1, admin_note = $2, reviewed_at = now() WHERE id = $3',
      [decision, note || null, id]
    );
    await client.query('COMMIT');

    let emailSent = false;
    try {
      emailSent = await notifyTransferDecision(
        {
          reference: row.reference,
          sender_name: row.sender_name,
          sender_email: row.sender_email,
          destination_bank: row.destination_bank,
          destination_country: row.destination_country,
          amount: row.amount,
          currency: row.currency
        },
        decision,
        note
      );
    } catch (e) {
      emailSent = false;
    }
    return res.status(200).json({ ok: true, status: decision, email_sent: emailSent });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

module.exports = async function handler(req, res) {
  const op = req.query && typeof req.query.op === 'string' ? req.query.op : '';
  if (op === 'review') return handleTransferReview(req, res);
  return handleTransfersList(req, res);
};
