// GET /api/admin-accounts — list client accounts for the staff dashboard.
// RECORD-KEEPING ONLY: this site is not real banking and no money ever moves
// through it. Balances shown here are records of deposits and withdrawals
// that happened at the bank itself (branch or counter); staff record them
// here so the dashboard shows what each client account holds.
// Authorization: Bearer <token> (see _auth.js).
// Query filters: search (client name, account number or application
// reference), status (active|on_hold), sort (created_at|balance|
// account_number), order (asc|desc), page, per_page (default 20, max 100).
// Returns the filtered page plus totals: total accounts, accounts on hold,
// and the summed balance per currency. Balances are NUMERIC strings.
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

const LIST_COLUMNS =
  'a.id, a.application_id, a.account_number, a.currency, a.balance, a.status, ' +
  'a.created_at, a.updated_at, ap.reference, ap.first_name, ap.last_name, ' +
  'ap.account_type';

const SORTABLE = {
  created_at: 'a.created_at',
  balance: 'a.balance',
  account_number: 'a.account_number'
};

const STATUSES = ['active', 'on_hold'];

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
  const search = clean(q.search);
  const sort = SORTABLE[clean(q.sort)] || 'a.created_at';
  const order = clean(q.order) === 'asc' ? 'ASC' : 'DESC';
  const perPage = Math.min(Math.max(parseInt(clean(q.per_page), 10) || 20, 1), 100);
  const page = Math.max(parseInt(clean(q.page), 10) || 1, 1);

  const where = [];
  const params = [];
  if (status) { params.push(status); where.push('a.status = $' + params.length); }
  if (search) {
    params.push('%' + search.replace(/[%_]/g, '') + '%');
    where.push("(ap.first_name ILIKE $" + params.length + " OR ap.last_name ILIKE $" + params.length +
      " OR a.account_number ILIKE $" + params.length + " OR ap.reference ILIKE $" + params.length +
      " OR (ap.first_name || ' ' || ap.last_name) ILIKE $" + params.length + ')');
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const fromSql = 'FROM accounts a JOIN applications ap ON ap.id = a.application_id ';

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
        "COUNT(*) FILTER (WHERE status = 'on_hold')::int AS on_hold " +
        'FROM accounts'
    );
    const totalsResult = await pool.query(
      'SELECT currency, SUM(balance)::text AS total FROM accounts GROUP BY currency ORDER BY currency'
    );
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total ' + fromSql + whereSql,
      params
    );
    const totalCount = countResult.rows[0].total;
    const totalPages = Math.max(Math.ceil(totalCount / perPage), 1);
    const safePage = Math.min(page, totalPages);
    const listParams = params.slice();
    listParams.push(perPage);
    listParams.push((safePage - 1) * perPage);
    const listResult = await pool.query(
      'SELECT ' + LIST_COLUMNS + ' ' + fromSql + whereSql +
        ' ORDER BY ' + sort + ' ' + order + ', a.id DESC' +
        ' LIMIT $' + (listParams.length - 1) + ' OFFSET $' + listParams.length,
      listParams
    );
    return res.status(200).json({
      ok: true,
      stats: {
        total: statsResult.rows[0].total,
        on_hold: statsResult.rows[0].on_hold,
        balances: totalsResult.rows
      },
      accounts: listResult.rows,
      page: safePage,
      per_page: perPage,
      total_count: totalCount,
      total_pages: totalPages
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
