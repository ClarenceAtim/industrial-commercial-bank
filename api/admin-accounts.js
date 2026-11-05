// GET /api/admin-accounts — list client accounts for the staff dashboard.
// POST /api/admin-accounts — create an account for an approved/active
// application that does not have one yet.
// RECORD-KEEPING ONLY: this site is not real banking and no money ever moves
// through it. Balances shown here are records of deposits and withdrawals
// that happened at the bank itself (branch or counter); staff record them
// here so the dashboard shows what each client account holds.
// Authorization: Bearer <token> (see _auth.js).
// GET query filters: search (client name, account number or application
// reference), status (active|on_hold), sort (created_at|balance|
// account_number), order (asc|desc), page, per_page (default 20, max 100).
// Returns the filtered page plus totals: total accounts, accounts on hold,
// and the summed balance per currency. Balances are NUMERIC strings.
// POST body (JSON): { reference, opening_balance, currency }.
//   reference: the application reference (ICB-YYYY-XXXXXX) — required.
//   opening_balance: optional, defaults to 0; a positive opening balance is
//     recorded as the first deposit transaction, exactly as the deposit
//     confirmation in admin-review.js does. This records a deposit that
//     already happened at the bank; it never moves money.
//   currency: optional, defaults to XAF.
//   The application must be approved or active and must not already have an
//   account (409 account_exists / 409 not_eligible). A new unique 10-digit
//   account number starting with '1' is allocated, and an 'account_created'
//   history event is recorded. Returns the new account number and balance.
// Required environment variable: DATABASE_URL.
const crypto = require('crypto');
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const { validCurrency } = require('./_money');

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

// A 10-digit account number starting with 1. Collisions are retried.
// Same rule as admin-review.js (which opens the account on deposit).
function makeAccountNumber() {
  let number = '1';
  for (let i = 0; i < 9; i++) number += String(crypto.randomInt(0, 10));
  return number;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Opening balance: zero or a positive amount with at most two decimals.
// Unlike validAmount in _money.js, zero is allowed here (a new account may
// start empty).
function validOpeningBalance(value) {
  if (value === undefined || value === null || value === '') return '0.00';
  const text = typeof value === 'number' ? String(value) : clean(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = parseFloat(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount.toFixed(2);
}

async function handleGet(req, res) {
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
}

async function handlePost(req, res) {
  const body = req.body || {};
  const reference = clean(body.reference).toUpperCase();
  const openingBalance = validOpeningBalance(body.opening_balance);
  const currency = validCurrency(body.currency);
  if (!reference || openingBalance === null || !currency) {
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
    const found = await client.query(
      'SELECT id, reference, status FROM applications WHERE reference = $1 FOR UPDATE',
      [reference]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const application = found.rows[0];
    if (application.status !== 'approved' && application.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'not_eligible' });
    }
    const existing = await client.query(
      'SELECT id FROM accounts WHERE application_id = $1',
      [application.id]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'account_exists' });
    }
    let account = null;
    let accountNumber = null;
    for (let attempt = 0; attempt < 5 && !account; attempt++) {
      accountNumber = makeAccountNumber();
      try {
        const inserted = await client.query(
          'INSERT INTO accounts (application_id, account_number, currency, balance, status) ' +
            'VALUES ($1, $2, $3, $4, $5) RETURNING id, account_number, currency, balance, status',
          [application.id, accountNumber, currency, openingBalance, 'active']
        );
        account = inserted.rows[0];
      } catch (e) {
        if (e.code === '23505') continue; // account number collision: try another one
        throw e;
      }
    }
    if (!account) throw new Error('could not allocate an account number');
    if (parseFloat(openingBalance) > 0) {
      await client.query(
        'INSERT INTO transactions (account_id, type, amount, note) VALUES ($1, $2, $3, $4)',
        [account.id, 'deposit', openingBalance, 'Opening balance recorded by staff']
      );
    }
    await client.query(
      'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
      [application.id, 'account_created', 'Account ' + accountNumber + ' created by staff']
    );
    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      account: {
        id: account.id,
        account_number: account.account_number,
        currency: account.currency,
        balance: account.balance,
        status: account.status
      }
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;
  if (req.method === 'GET') return handleGet(req, res);
  return handlePost(req, res);
};
