// GET /api/admin-transfers — list transfer requests for the staff dashboard.
// Authorization: Bearer <token> (see _auth.js).
// Query filters: status (pending|approved|rejected), region
// (africa|europe|america|asia), search (sender name, reference or destination
// bank), sort (created_at|reference|amount), order (asc|desc), page, per_page
// (default 20, max 100). Returns the filtered page plus overview stats and
// page counts. Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

const LIST_COLUMNS =
  'id, reference, sender_name, sender_email, sender_phone, account_number, ' +
  'destination_bank, destination_region, destination_country, recipient_name, ' +
  'recipient_account, amount, currency, purpose, status, admin_note, created_at, reviewed_at';

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

module.exports = async function handler(req, res) {
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
    const listResult = await pool.query(
      'SELECT ' + LIST_COLUMNS + ' FROM transfer_requests ' + whereSql +
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
};
