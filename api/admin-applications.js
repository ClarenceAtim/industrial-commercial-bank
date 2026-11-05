// GET /api/admin-applications — list applications for the staff dashboard.
// Authorization: Bearer <token> (see _auth.js).
// Query filters: status (pending|approved|rejected), account_type
// (current|savings|business), search (name, email or reference), date_from,
// date_to (YYYY-MM-DD, on created_at), sort (created_at|last_name|reference|
// status), order (asc|desc), page, per_page (default 20, max 100).
// Returns the filtered page plus overview stats and page counts. Photo bytes
// are never included here; use /api/admin-application?id= for one file.
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

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

module.exports = async function handler(req, res) {
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
};
