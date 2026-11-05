// Merged application endpoints for the staff dashboard.
// Serves (via vercel.json rewrites, op query parameter):
//   /api/admin-applications            list applications (default)
//   /api/admin-application?op=detail   one application with history
//   /api/admin-review?op=review        decide on an application
//   /api/admin-delete?op=delete        delete an application
//   /api/admin-export?op=export        download the list as CSV
// Authorization: Bearer <token> (see _auth.js). All validation,
// transitions, status codes and email behaviour are unchanged
// from the original endpoints. Required environment variable:
// DATABASE_URL. Optional email: see _mail.js.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const crypto = require('crypto');
const { notifyApplicantDecision } = require('./_mail');
const { validAmount, validCurrency } = require('./_money');

const LIST_COLUMNS =
  'id, reference, first_name, last_name, email, phone, account_type, status, created_at, reviewed_at';

const SORTABLE = {
  created_at: 'created_at',
  last_name: 'last_name',
  reference: 'reference',
  status: 'status'
};

const ACCOUNT_TYPES = ['current', 'savings', 'business'];
const STATUSES = ['pending', 'approved', 'deposit_requested', 'active', 'rejected'];

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// A 10-digit account number starting with 1. Collisions are retried.
function makeAccountNumber() {
  let number = '1';
  for (let i = 0; i < 9; i++) number += String(crypto.randomInt(0, 10));
  return number;
}

// decision -> statuses it may move from
const ALLOWED_FROM = {
  approved: ['pending'],
  rejected: ['pending'],
  deposit_requested: ['approved'],
  deposit_received: ['deposit_requested'],
  reopened: ['approved', 'rejected']
};

// decision -> status the application moves to
const NEW_STATUS = {
  approved: 'approved',
  rejected: 'rejected',
  deposit_requested: 'deposit_requested',
  deposit_received: 'active',
  reopened: 'pending'
};

// decisions that email the applicant automatically
const EMAILS_APPLICANT = ['approved', 'rejected', 'deposit_requested', 'deposit_received'];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

async function handleApplicationsList(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const q = req.query || {};
  const status = STATUSES.indexOf(clean(q.status)) !== -1 ? clean(q.status) : null;
  const accountType = ACCOUNT_TYPES.indexOf(clean(q.account_type)) !== -1 ? clean(q.account_type) : null;
  const search = clean(q.search);
  const dateFrom = validDate(clean(q.date_from)) ? clean(q.date_from) : null;
  const dateTo = validDate(clean(q.date_to)) ? clean(q.date_to) : null;
  const sort = SORTABLE[clean(q.sort)] || 'created_at';
  const order = clean(q.order) === 'asc' ? 'ASC' : 'DESC';
  const perPage = Math.min(Math.max(parseInt(clean(q.per_page), 10) || 20, 1), 100);
  const page = Math.max(parseInt(clean(q.page), 10) || 1, 1);

  const where = [];
  const params = [];
  if (status) { params.push(status); where.push('status = $' + params.length); }
  if (accountType) { params.push(accountType); where.push('account_type = $' + params.length); }
  if (search) {
    params.push('%' + search.replace(/[%_]/g, '') + '%');
    where.push("(first_name ILIKE $" + params.length + " OR last_name ILIKE $" + params.length +
      " OR email ILIKE $" + params.length + " OR reference ILIKE $" + params.length +
      " OR (first_name || ' ' || last_name) ILIKE $" + params.length + ')');
  }
  if (dateFrom) { params.push(dateFrom); where.push('created_at >= $' + params.length); }
  if (dateTo) { params.push(dateTo); where.push('created_at < ($' + params.length + "::date + interval '1 day')"); }
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
        "COUNT(*) FILTER (WHERE status = 'deposit_requested')::int AS deposit_requested, " +
        "COUNT(*) FILTER (WHERE status = 'active')::int AS active, " +
        "COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected, " +
        "COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now()))::int AS this_month " +
        'FROM applications'
    );
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM applications ' + whereSql,
      params
    );
    const totalCount = countResult.rows[0].total;
    const totalPages = Math.max(Math.ceil(totalCount / perPage), 1);
    const safePage = Math.min(page, totalPages);
    const listParams = params.slice();
    listParams.push(perPage);
    listParams.push((safePage - 1) * perPage);
    const listResult = await pool.query(
      'SELECT ' + LIST_COLUMNS + ' FROM applications ' + whereSql +
        ' ORDER BY ' + sort + ' ' + order + ', id DESC' +
        ' LIMIT $' + (listParams.length - 1) + ' OFFSET $' + listParams.length,
      listParams
    );
    return res.status(200).json({
      ok: true,
      stats: statsResult.rows[0],
      applications: listResult.rows,
      page: safePage,
      per_page: perPage,
      total_count: totalCount,
      total_pages: totalPages
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleApplicationDetail(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.query && req.query.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const result = await pool.query(
      'SELECT id, reference, first_name, last_name, dob, nationality, phone, email, ' +
        'address, id_type, id_number, id_photo, id_photo_filename, id_photo_mimetype, ' +
        'account_type, status, admin_note, created_at, reviewed_at ' +
        'FROM applications WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = result.rows[0];
    const eventsResult = await pool.query(
      'SELECT action, note, created_at FROM application_events ' +
        'WHERE application_id = $1 ORDER BY created_at ASC, id ASC',
      [id]
    );
    const application = {
      id: row.id,
      reference: row.reference,
      first_name: row.first_name,
      last_name: row.last_name,
      dob: row.dob,
      nationality: row.nationality,
      phone: row.phone,
      email: row.email,
      address: row.address,
      id_type: row.id_type,
      id_number: row.id_number,
      id_photo_base64: row.id_photo ? row.id_photo.toString('base64') : null,
      id_photo_filename: row.id_photo_filename,
      id_photo_mimetype: row.id_photo_mimetype,
      account_type: row.account_type,
      status: row.status,
      admin_note: row.admin_note,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at
    };
    return res.status(200).json({ ok: true, application, events: eventsResult.rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleApplicationReview(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const id = parseInt(body.id, 10);
  const decision = typeof body.decision === 'string' ? body.decision.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!id || !ALLOWED_FROM[decision]) {
    return res.status(400).json({ ok: false, error: 'invalid_fields' });
  }
  // Confirming a deposit opens the account, so the received amount is
  // required (currency defaults to XAF when not given).
  let depositAmount = null;
  let depositCurrency = 'XAF';
  if (decision === 'deposit_received') {
    depositAmount = validAmount(body.amount);
    depositCurrency = validCurrency(body.currency);
    if (!depositAmount || !depositCurrency) {
      return res.status(400).json({ ok: false, error: 'invalid_fields' });
    }
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
      'SELECT id, reference, first_name, last_name, email, status FROM applications WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = current.rows[0];
    if (ALLOWED_FROM[decision].indexOf(row.status) === -1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'invalid_transition' });
    }
    const newStatus = NEW_STATUS[decision];
    await client.query(
      'UPDATE applications SET status = $1, admin_note = $2, reviewed_at = now() WHERE id = $3',
      [newStatus, note || null, id]
    );
    await client.query(
      'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
      [id, decision, note || null]
    );
    let accountNumber = null;
    if (decision === 'deposit_received') {
      const existing = await client.query(
        'SELECT id FROM accounts WHERE application_id = $1',
        [id]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, error: 'account_exists' });
      }
      let account = null;
      for (let attempt = 0; attempt < 5 && !account; attempt++) {
        accountNumber = makeAccountNumber();
        try {
          const inserted = await client.query(
            'INSERT INTO accounts (application_id, account_number, currency, balance, status) ' +
              'VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [id, accountNumber, depositCurrency, depositAmount, 'active']
          );
          account = inserted.rows[0];
        } catch (e) {
          if (e.code === '23505') continue; // account number collision: try another one
          throw e;
        }
      }
      if (!account) throw new Error('could not allocate an account number');
      await client.query(
        'INSERT INTO transactions (account_id, type, amount, note) VALUES ($1, $2, $3, $4)',
        [account.id, 'deposit', depositAmount, note || null]
      );
    }
    await client.query('COMMIT');

    let emailSent = false;
    if (EMAILS_APPLICANT.indexOf(decision) !== -1) {
      try {
        emailSent = await notifyApplicantDecision(
          { reference: row.reference, first_name: row.first_name, last_name: row.last_name, email: row.email },
          decision,
          note,
          { amount: depositAmount, currency: depositCurrency, account_number: accountNumber }
        );
      } catch (e) {
        emailSent = false;
      }
    }
    const response = { ok: true, status: newStatus, email_sent: emailSent };
    if (decision === 'deposit_received') {
      response.account_number = accountNumber;
      response.balance = depositAmount;
      response.currency = depositCurrency;
    }
    return res.status(200).json(response);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

async function handleApplicationDelete(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.body && req.body.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const result = await pool.query('DELETE FROM applications WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleApplicationExport(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const q = req.query || {};
  const status = STATUSES.indexOf(clean(q.status)) !== -1 ? clean(q.status) : null;
  const accountType = ACCOUNT_TYPES.indexOf(clean(q.account_type)) !== -1 ? clean(q.account_type) : null;
  const search = clean(q.search);
  const dateFrom = validDate(clean(q.date_from)) ? clean(q.date_from) : null;
  const dateTo = validDate(clean(q.date_to)) ? clean(q.date_to) : null;

  const where = [];
  const params = [];
  if (status) { params.push(status); where.push('status = $' + params.length); }
  if (accountType) { params.push(accountType); where.push('account_type = $' + params.length); }
  if (search) {
    params.push('%' + search.replace(/[%_]/g, '') + '%');
    where.push("(first_name ILIKE $" + params.length + " OR last_name ILIKE $" + params.length +
      " OR email ILIKE $" + params.length + " OR reference ILIKE $" + params.length +
      " OR (first_name || ' ' || last_name) ILIKE $" + params.length + ')');
  }
  if (dateFrom) { params.push(dateFrom); where.push('created_at >= $' + params.length); }
  if (dateTo) { params.push(dateTo); where.push('created_at < ($' + params.length + "::date + interval '1 day')"); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const result = await pool.query(
      'SELECT reference, first_name, last_name, email, phone, nationality, dob, address, ' +
        'id_type, id_number, account_type, status, created_at, reviewed_at, admin_note ' +
        'FROM applications ' + whereSql + ' ORDER BY created_at DESC, id DESC',
      params
    );
    const header = [
      'reference', 'first_name', 'last_name', 'email', 'phone', 'nationality', 'dob',
      'address', 'id_type', 'id_number', 'account_type', 'status', 'created_at',
      'reviewed_at', 'admin_note'
    ];
    const lines = [header.join(',')];
    result.rows.forEach(function (row) {
      lines.push(header.map(function (key) { return csvCell(row[key]); }).join(','));
    });
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="applications-' + today + '.csv"');
    return res.status(200).send('\uFEFF' + lines.join('\r\n'));
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

module.exports = async function handler(req, res) {
  const op = req.query && typeof req.query.op === 'string' ? req.query.op : '';
  if (op === 'detail') return handleApplicationDetail(req, res);
  if (op === 'review') return handleApplicationReview(req, res);
  if (op === 'delete') return handleApplicationDelete(req, res);
  if (op === 'export') return handleApplicationExport(req, res);
  return handleApplicationsList(req, res);
};
