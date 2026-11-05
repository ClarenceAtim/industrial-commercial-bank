// GET /api/admin-export — download the filtered application list as CSV.
// Authorization: Bearer <token> (see _auth.js).
// Accepts the same filters as /api/admin-applications: status, account_type,
// search (name, email or reference), date_from, date_to. No pagination:
// every matching row is exported. Photo bytes are never included.
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

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

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
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
};
