// Merged account endpoints for the staff dashboard.
// Serves (via vercel.json rewrites, op query parameter):
//   /api/admin-accounts               list accounts (GET) / create one (POST)
//   /api/admin-account?op=detail      one account (GET) / delete it (DELETE)
//   /api/admin-transaction?op=transaction  record a deposit or withdrawal
//   /api/admin-hold?op=hold           put an account on hold / release it
//   /api/admin-reset-pin?op=reset-pin  staff reset of a client's 4-digit PIN
//   /api/admin-deposits?op=deposits   list client deposit requests (GET)
//   /api/admin-deposit-review?op=deposit-review  approve or refuse a
//                                     deposit request; approving credits
//                                     the account balance and records a
//                                     deposit transaction
// RECORD-KEEPING ONLY: this site is not real banking and no money
// ever moves through it. Authorization: Bearer <token> (see
// _auth.js). Required environment variable: DATABASE_URL.
const crypto = require('crypto');
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const { validPin, hashPin, pinColumnsPresent, PIN_MIGRATION_MESSAGE } = require('./_auth');
const { validCurrency } = require('./_money');
const { validAmount } = require('./_money');
const { notifyClientCreditAlert } = require('./_mail');

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
  // Staff may set the client's 4-digit PIN here. It is optional only
  // when the application already has one.
  const accountPin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (accountPin && !validPin(accountPin)) {
    return res.status(400).json({ ok: false, error: 'invalid_pin' });
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  const client = await pool.connect();
  try {
    // The PIN columns arrive with the 2026-11-06 migration
    // (sql/migrations/2026-11-06-client-pin-login.sql). A new account
    // needs a PIN, so fail with a clear error until it has run.
    if (!(await pinColumnsPresent(client))) {
      return res.status(500).json({
        ok: false,
        error: 'migration_required',
        message: PIN_MIGRATION_MESSAGE
      });
    }
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT id, reference, status, pin_hash FROM applications WHERE reference = $1 FOR UPDATE',
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
    // The account needs a PIN for the client to sign in: the PIN staff
    // just set wins; otherwise the PIN the client chose when they
    // applied is copied over. With neither, the account cannot open.
    let accountPinHash = null;
    if (accountPin) {
      accountPinHash = hashPin(accountPin);
    } else if (application.pin_hash) {
      accountPinHash = application.pin_hash;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'pin_required' });
    }
    let account = null;
    let accountNumber = null;
    for (let attempt = 0; attempt < 5 && !account; attempt++) {
      accountNumber = makeAccountNumber();
      try {
        const inserted = await client.query(
          'INSERT INTO accounts (application_id, account_number, currency, balance, status, pin_hash) ' +
            'VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, account_number, currency, balance, status',
          [application.id, accountNumber, currency, openingBalance, 'active', accountPinHash]
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

async function handleAccountGet(req, res) {
  const q = req.query || {};
  const id = parseInt(q.id, 10);
  const applicationId = parseInt(q.application_id, 10);
  if (!id && !applicationId) {
    return res.status(400).json({ ok: false, error: 'invalid_id' });
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const result = await pool.query(
      'SELECT a.id, a.application_id, a.account_number, a.currency, a.balance, ' +
        'a.status, a.created_at, a.updated_at, a.pin_hash IS NOT NULL AS pin_set, ' +
        'ap.reference, ap.first_name, ' +
        'ap.last_name, ap.email, ap.phone, ap.account_type, ap.status AS application_status ' +
        'FROM accounts a JOIN applications ap ON ap.id = a.application_id ' +
        'WHERE ' + (id ? 'a.id = $1' : 'a.application_id = $1'),
      [id || applicationId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = result.rows[0];
    const txResult = await pool.query(
      'SELECT id, type, amount, note, created_at FROM transactions ' +
        'WHERE account_id = $1 ORDER BY created_at DESC, id DESC',
      [row.id]
    );
    const account = {
      id: row.id,
      application_id: row.application_id,
      account_number: row.account_number,
      currency: row.currency,
      balance: row.balance,
      status: row.status,
      pin_set: !!row.pin_set,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reference: row.reference,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      account_type: row.account_type,
      application_status: row.application_status
    };
    return res.status(200).json({ ok: true, account, transactions: txResult.rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleAccountDelete(req, res) {
  const q = req.query || {};
  const id = parseInt(q.id, 10);
  if (!id) {
    return res.status(400).json({ ok: false, error: 'invalid_id' });
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
      'SELECT id, application_id, account_number, balance, status FROM accounts WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const account = found.rows[0];
    if (account.status === 'on_hold') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'account_on_hold' });
    }
    if (Number(account.balance) !== 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'nonzero_balance' });
    }
    await client.query('DELETE FROM transactions WHERE account_id = $1', [id]);
    await client.query('DELETE FROM accounts WHERE id = $1', [id]);
    await client.query(
      'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
      [account.application_id, 'account_deleted', 'Account ' + account.account_number + ' deleted by staff']
    );
    await client.query('COMMIT');
    return res.status(200).json({ ok: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

async function handleAccounts(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;
  if (req.method === 'GET') return handleGet(req, res);
  return handlePost(req, res);
}

async function handleAccountDetail(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;
  if (req.method === 'GET') return handleAccountGet(req, res);
  return handleAccountDelete(req, res);
}

async function handleTransaction(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const accountId = parseInt(body.account_id, 10);
  const type = typeof body.type === 'string' ? body.type.trim() : '';
  const amount = validAmount(body.amount);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!accountId || (type !== 'deposit' && type !== 'withdrawal') || !amount) {
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
    const accountResult = await client.query(
      'SELECT id, application_id, currency, balance, status FROM accounts WHERE id = $1 FOR UPDATE',
      [accountId]
    );
    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const account = accountResult.rows[0];
    if (account.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'account_on_hold' });
    }
    if (type === 'withdrawal' && parseFloat(account.balance) < parseFloat(amount)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'insufficient_balance' });
    }
    await client.query(
      'INSERT INTO transactions (account_id, type, amount, note) VALUES ($1, $2, $3, $4)',
      [accountId, type, amount, note || null]
    );
    const updated = await client.query(
      type === 'deposit'
        ? 'UPDATE accounts SET balance = balance + $2, updated_at = now() WHERE id = $1 RETURNING balance, currency'
        : 'UPDATE accounts SET balance = balance - $2, updated_at = now() WHERE id = $1 RETURNING balance, currency',
      [accountId, amount]
    );
    const eventAction = type === 'deposit' ? 'deposit_recorded' : 'withdrawal_recorded';
    const eventNote = amount + ' ' + account.currency + (note ? ' — ' + note : '');
    await client.query(
      'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
      [account.application_id, eventAction, eventNote]
    );
    await client.query('COMMIT');
    // A deposit is a credit alert for the client: email them the amount,
    // the new balance, and the message staff typed. Best-effort — the
    // deposit itself already succeeded, and email stays inert until the
    // bank's SMTP details are configured.
    let emailSent = false;
    if (type === 'deposit') {
      try {
        const who = await pool.query(
          'SELECT ap.email, ap.first_name, ap.last_name, a.account_number ' +
            'FROM accounts a JOIN applications ap ON ap.id = a.application_id WHERE a.id = $1',
          [accountId]
        );
        if (who.rows.length > 0) {
          emailSent = await notifyClientCreditAlert({
            email: who.rows[0].email,
            name: who.rows[0].first_name + ' ' + who.rows[0].last_name,
            account_number: who.rows[0].account_number,
            amount: amount,
            currency: account.currency,
            balance: updated.rows[0].balance,
            message: note || ''
          });
        }
      } catch (ignored) {}
    }
    return res.status(200).json({
      ok: true,
      balance: updated.rows[0].balance,
      currency: updated.rows[0].currency,
      email_sent: emailSent
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

async function handleResetPin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const accountId = parseInt(body.account_id, 10);
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (!accountId || !validPin(pin)) {
    return res.status(400).json({ ok: false, error: 'invalid_pin' });
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  const client = await pool.connect();
  try {
    if (!(await pinColumnsPresent(client))) {
      return res.status(500).json({
        ok: false,
        error: 'migration_required',
        message: PIN_MIGRATION_MESSAGE
      });
    }
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT id, application_id, account_number FROM accounts WHERE id = $1 FOR UPDATE',
      [accountId]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    // Only the salted hash is stored; the PIN itself is never kept.
    // Resetting also clears any lockout from wrong attempts.
    await client.query(
      'UPDATE accounts SET pin_hash = $1, failed_login_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $2',
      [hashPin(pin), accountId]
    );
    await client.query(
      'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
      [found.rows[0].application_id, 'pin_reset', 'Client PIN reset by staff']
    );
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, pin_set: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

async function handleHold(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const accountId = parseInt(body.account_id, 10);
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!accountId || (action !== 'hold' && action !== 'release')) {
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
    const accountResult = await client.query(
      'SELECT id, application_id, status FROM accounts WHERE id = $1 FOR UPDATE',
      [accountId]
    );
    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const account = accountResult.rows[0];
    const newStatus = action === 'hold' ? 'on_hold' : 'active';
    if (account.status === newStatus) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'invalid_transition' });
    }
    await client.query(
      'UPDATE accounts SET status = $1, updated_at = now() WHERE id = $2',
      [newStatus, accountId]
    );
    const eventAction = action === 'hold' ? 'account_hold' : 'account_released';
    await client.query(
      'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
      [account.application_id, eventAction, note || null]
    );
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, status: newStatus });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

async function handleDepositsList(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const q = req.query || {};
  const status = ['pending', 'approved', 'rejected'].indexOf(clean(q.status)) !== -1 ? clean(q.status) : null;
  const search = clean(q.search);
  const sort = ['created_at', 'reference', 'amount'].indexOf(clean(q.sort)) !== -1 ? clean(q.sort) : 'created_at';
  const order = clean(q.order) === 'asc' ? 'ASC' : 'DESC';
  const perPage = Math.min(Math.max(parseInt(clean(q.per_page), 10) || 20, 1), 100);
  const page = Math.max(parseInt(clean(q.page), 10) || 1, 1);

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    // The deposit_requests table arrives with the 2026-11-06 migration
    // (sql/migrations/2026-11-06-deposit-requests.sql). Until it has run,
    // the tab reports that instead of failing.
    const probe = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_requests'"
    );
    if (probe.rows.length === 0) {
      return res.status(200).json({
        ok: true,
        migration_required: true,
        stats: { total: 0, pending: 0, approved: 0, rejected: 0 },
        deposits: [],
        page: 1,
        per_page: perPage,
        total_count: 0,
        total_pages: 1
      });
    }
    const fromSql =
      'FROM deposit_requests d ' +
      'JOIN accounts a ON a.id = d.account_id ' +
      'JOIN applications ap ON ap.id = a.application_id ';
    const where = [];
    const params = [];
    if (status) { params.push(status); where.push('d.status = $' + params.length); }
    if (search) {
      params.push('%' + search.replace(/[%_]/g, '') + '%');
      where.push("(d.reference ILIKE $" + params.length +
        " OR a.account_number ILIKE $" + params.length +
        " OR ap.first_name ILIKE $" + params.length +
        " OR ap.last_name ILIKE $" + params.length +
        " OR (ap.first_name || ' ' || ap.last_name) ILIKE $" + params.length + ')');
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const statsResult = await pool.query(
      'SELECT ' +
        'COUNT(*)::int AS total, ' +
        "COUNT(*) FILTER (WHERE d.status = 'pending')::int AS pending, " +
        "COUNT(*) FILTER (WHERE d.status = 'approved')::int AS approved, " +
        "COUNT(*) FILTER (WHERE d.status = 'rejected')::int AS rejected " +
        fromSql
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
    const sortColumn = sort === 'amount' ? 'd.amount' : sort === 'reference' ? 'd.reference' : 'd.created_at';
    const listResult = await pool.query(
      'SELECT d.id, d.reference, d.amount, d.currency, d.method, d.note, d.status, ' +
        'd.admin_note, d.created_at, d.reviewed_at, a.id AS account_id, a.account_number, ' +
        'a.currency AS account_currency, a.balance, ap.first_name, ap.last_name, ap.email ' +
        fromSql + whereSql +
        ' ORDER BY ' + sortColumn + ' ' + order + ', d.id DESC' +
        ' LIMIT $' + (listParams.length - 1) + ' OFFSET $' + listParams.length,
      listParams
    );
    return res.status(200).json({
      ok: true,
      stats: statsResult.rows[0],
      deposits: listResult.rows,
      page: safePage,
      per_page: perPage,
      total_count: totalCount,
      total_pages: totalPages
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleDepositReview(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const id = parseInt(body.id, 10);
  const decision = typeof body.decision === 'string' ? body.decision.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!id || (decision !== 'approved' && decision !== 'rejected')) {
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
    const probe = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_requests'"
    );
    if (probe.rows.length === 0) {
      return res.status(500).json({
        ok: false,
        error: 'migration_required',
        message: 'The deposit_requests table is missing: run sql/migrations/2026-11-06-deposit-requests.sql in the Neon SQL editor first.'
      });
    }
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT d.id, d.account_id, d.reference, d.amount, d.currency, d.status, ' +
        'a.application_id, a.currency AS account_currency, a.balance, a.status AS account_status ' +
        'FROM deposit_requests d JOIN accounts a ON a.id = d.account_id ' +
        'WHERE d.id = $1 FOR UPDATE OF d',
      [id]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const request = found.rows[0];
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'invalid_transition' });
    }
    if (request.account_status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'account_on_hold' });
    }
    // A deposit is only credited when the requested currency matches the
    // account currency; otherwise staff record the deposit manually from
    // the Client accounts tab instead of approving here.
    if (decision === 'approved' && request.currency !== request.account_currency) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'currency_mismatch' });
    }
    let balance = request.balance;
    if (decision === 'approved') {
      await client.query(
        'INSERT INTO transactions (account_id, type, amount, note) VALUES ($1, $2, $3, $4)',
        [request.account_id, 'deposit', request.amount, 'Deposit request ' + request.reference + (note ? ' — ' + note : '')]
      );
      const updated = await client.query(
        'UPDATE accounts SET balance = balance + $2, updated_at = now() WHERE id = $1 RETURNING balance',
        [request.account_id, request.amount]
      );
      balance = updated.rows[0].balance;
      await client.query(
        'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
        [request.application_id, 'deposit_recorded', request.amount + ' ' + request.currency + ' — ' + request.reference]
      );
    }
    await client.query(
      'UPDATE deposit_requests SET status = $1, admin_note = $2, reviewed_at = now() WHERE id = $3',
      [decision, note || null, id]
    );
    await client.query('COMMIT');
    // Approving a deposit credits the account: send the client the same
    // credit alert as a staff-recorded deposit. Best-effort.
    let emailSent = false;
    if (decision === 'approved') {
      try {
        const who = await pool.query(
          'SELECT ap.email, ap.first_name, ap.last_name, a.account_number ' +
            'FROM accounts a JOIN applications ap ON ap.id = a.application_id WHERE a.id = $1',
          [request.account_id]
        );
        if (who.rows.length > 0) {
          emailSent = await notifyClientCreditAlert({
            email: who.rows[0].email,
            name: who.rows[0].first_name + ' ' + who.rows[0].last_name,
            account_number: who.rows[0].account_number,
            amount: request.amount,
            currency: request.currency,
            balance: balance,
            message: note || ''
          });
        }
      } catch (ignored) {}
    }
    return res.status(200).json({
      ok: true,
      status: decision,
      balance: balance,
      currency: request.account_currency,
      email_sent: emailSent
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

module.exports = async function handler(req, res) {
  const op = req.query && typeof req.query.op === 'string' ? req.query.op : '';
  if (op === 'detail') return handleAccountDetail(req, res);
  if (op === 'transaction') return handleTransaction(req, res);
  if (op === 'reset-pin') return handleResetPin(req, res);
  if (op === 'hold') return handleHold(req, res);
  if (op === 'deposits') return handleDepositsList(req, res);
  if (op === 'deposit-review') return handleDepositReview(req, res);
  return handleAccounts(req, res);
};
