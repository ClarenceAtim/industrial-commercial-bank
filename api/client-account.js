// Merged customer-portal endpoints.
// Serves (via vercel.json rewrites, op query parameter):
//   /api/client-account               the signed-in customer's account view (default)
//   /api/client-login?op=login        sign a customer in (email address +
//                                     4-digit PIN)
//   /api/client-transfer-approve?op=approve  a customer confirms one of their
//                                     own pending transfer requests
//   /api/client-deposit-request?op=request-deposit  a customer asks the bank
//                                     to record a deposit of an amount they type
// Authorization: Bearer <client token> (see _auth.js — 2-hour token
// issued by /api/client-login). RECORD-KEEPING ONLY: no money ever
// moves through this site. A deposit request only asks the bank to
// record a deposit; staff approve it in the dashboard and only then
// does the balance change. Required environment variables:
// DATABASE_URL, ADMIN_SECRET.
const { getPool } = require('./_db');
const { clientAccountId } = require('./_auth');
const { issueClientToken } = require('./_auth');
const { validPin, verifyPin, pinColumnsPresent, PIN_MIGRATION_MESSAGE } = require('./_auth');
const { validAmount, validCurrency } = require('./_money');
const crypto = require('crypto');

// Sign-in protection: five wrong PINs lock the account for 15 minutes.
const MAX_FAILED_LOGINS = 5;
const PIN_LOCK_MINUTES = 15;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function handleClientAccount(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const accountId = clientAccountId(req);
  if (!accountId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const accountResult = await pool.query(
      'SELECT a.id, a.account_number, a.currency, a.balance, a.status, ' +
        'a.created_at, ap.reference, ap.first_name, ap.last_name, ap.account_type ' +
        'FROM accounts a JOIN applications ap ON ap.id = a.application_id ' +
        'WHERE a.id = $1',
      [accountId]
    );
    if (accountResult.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const account = accountResult.rows[0];
    const txResult = await pool.query(
      'SELECT id, type, amount, note, created_at FROM transactions ' +
        'WHERE account_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50',
      [accountId]
    );
    // Transfer requests are matched by account number, the same number the
    // customer typed at sign-in. Flags default to false before the migration.
    let transferColumns = 'false AS client_approved, false AS is_manual_bank';
    try {
      const probe = await pool.query(
        "SELECT column_name FROM information_schema.columns " +
          "WHERE table_name = 'transfer_requests' AND column_name IN ('client_approved', 'is_manual_bank')"
      );
      const found = {};
      probe.rows.forEach(function (row) { found[row.column_name] = true; });
      transferColumns =
        (found.client_approved ? 'client_approved' : 'false AS client_approved') + ', ' +
        (found.is_manual_bank ? 'is_manual_bank' : 'false AS is_manual_bank');
    } catch (e) {
      // keep the false defaults
    }
    const trfResult = await pool.query(
      'SELECT id, reference, destination_bank, destination_region, ' +
        'destination_country, recipient_name, amount, currency, status, ' +
        transferColumns + ', created_at ' +
        'FROM transfer_requests WHERE account_number = $1 ORDER BY created_at DESC, id DESC LIMIT 50',
      [account.account_number]
    );
    // Deposit requests arrive with the 2026-11-06 migration
    // (sql/migrations/2026-11-06-deposit-requests.sql). Until it has run,
    // the list is simply empty.
    let deposits = [];
    try {
      const depResult = await pool.query(
        'SELECT id, reference, amount, currency, method, status, created_at ' +
          'FROM deposit_requests WHERE account_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50',
        [accountId]
      );
      deposits = depResult.rows;
    } catch (e) {
      deposits = [];
    }
    return res.status(200).json({
      ok: true,
      account: {
        account_number: account.account_number,
        currency: account.currency,
        balance: account.balance,
        status: account.status,
        created_at: account.created_at,
        reference: account.reference,
        first_name: account.first_name,
        last_name: account.last_name,
        account_type: account.account_type
      },
      transactions: txResult.rows,
      transfers: trfResult.rows,
      deposits: deposits
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleClientLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const email = clean(body.email).toLowerCase();
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (!email || !validPin(pin)) {
    return res.status(400).json({ ok: false, error: 'invalid_fields' });
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    // The PIN columns arrive with the 2026-11-06 migration
    // (sql/migrations/2026-11-06-client-pin-login.sql). Until it has run,
    // fail with a clear error instead of a raw database error.
    if (!(await pinColumnsPresent(pool))) {
      return res.status(500).json({
        ok: false,
        error: 'migration_required',
        message: PIN_MIGRATION_MESSAGE
      });
    }
    const result = await pool.query(
      'SELECT a.id, a.pin_hash, a.failed_login_attempts, a.pin_locked_until ' +
        'FROM accounts a JOIN applications ap ON ap.id = a.application_id ' +
        "WHERE lower(ap.email) = $1 AND a.status = 'active'",
      [email]
    );
    // Unknown email: the same generic error as a wrong PIN, and nothing
    // is recorded — the attempt must not reveal whether the email exists.
    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const now = Date.now();
    const locked = [];
    const withPin = [];
    const withoutPin = [];
    result.rows.forEach(function (row) {
      const lockedUntil = row.pin_locked_until ? new Date(row.pin_locked_until).getTime() : 0;
      if (lockedUntil > now) locked.push(row);
      else if (row.pin_hash) withPin.push(row);
      else withoutPin.push(row);
    });
    // A matching PIN on an account that is not locked signs in. The
    // successful sign-in clears that account's failure count.
    for (let i = 0; i < withPin.length; i++) {
      if (verifyPin(pin, withPin[i].pin_hash)) {
        await pool.query(
          'UPDATE accounts SET failed_login_attempts = 0, pin_locked_until = NULL WHERE id = $1',
          [withPin[i].id]
        );
        const token = issueClientToken(withPin[i].id);
        if (!token) {
          return res.status(500).json({ ok: false, error: 'server_error' });
        }
        return res.status(200).json({ ok: true, token: token });
      }
    }
    // No match. A locked account says so plainly — even a correct PIN on
    // a locked account stays locked until the time runs out.
    if (locked.length > 0) {
      return res.status(429).json({ ok: false, error: 'pin_locked' });
    }
    // None of this email's accounts has a PIN yet: the bank must set one
    // before the client can sign in.
    if (withPin.length === 0 && withoutPin.length > 0) {
      return res.status(403).json({ ok: false, error: 'pin_not_set' });
    }
    // Wrong PIN: count one failure per account that has a PIN. At five
    // failures the account locks for 15 minutes.
    for (let i = 0; i < withPin.length; i++) {
      await pool.query(
        'UPDATE accounts SET failed_login_attempts = failed_login_attempts + 1, ' +
          "pin_locked_until = CASE WHEN failed_login_attempts + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE pin_locked_until END " +
          'WHERE id = $1',
        [withPin[i].id, MAX_FAILED_LOGINS, String(PIN_LOCK_MINUTES)]
      );
    }
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function handleClientApprove(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const accountId = clientAccountId(req);
  if (!accountId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const id = parseInt(body.id, 10);
  if (!id) {
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
      'SELECT account_number FROM accounts WHERE id = $1',
      [accountId]
    );
    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const accountNumber = accountResult.rows[0].account_number;
    const found = await client.query(
      'SELECT id, status, client_approved FROM transfer_requests ' +
        'WHERE id = $1 AND account_number = $2 FOR UPDATE',
      [id, accountNumber]
    ).catch(function (e) {
      // 42703 = undefined column: the client-portal migration has not run yet.
      if (e && e.code === '42703') {
        const missing = new Error('missing column client_approved');
        missing.code = 'MIGRATION_REQUIRED';
        throw missing;
      }
      throw e;
    });
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const request = found.rows[0];
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'invalid_transition' });
    }
    if (!request.client_approved) {
      await client.query(
        'UPDATE transfer_requests SET client_approved = true WHERE id = $1',
        [id]
      );
    }
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, client_approved: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    if (e && e.code === 'MIGRATION_REQUIRED') {
      return res.status(500).json({
        ok: false,
        error: 'migration_required',
        message: 'The client_approved column is missing: run sql/migrations/2026-11-05-client-portal.sql in the Neon SQL editor first.'
      });
    }
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

const DEPOSIT_METHODS = ['bank_transfer', 'cash', 'mobile_money', 'other'];

function makeDepositReference() {
  const year = new Date().getFullYear();
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return 'DEP-' + year + '-' + digits;
}

async function handleClientDepositRequest(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const accountId = clientAccountId(req);
  if (!accountId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const amount = validAmount(body.amount);
  const currency = validCurrency(body.currency);
  const method = typeof body.method === 'string' ? body.method.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!amount || !currency || DEPOSIT_METHODS.indexOf(method) === -1) {
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
    // The deposit_requests table arrives with the 2026-11-06 migration
    // (sql/migrations/2026-11-06-deposit-requests.sql). Until it has run,
    // fail with a clear error instead of recording anything half-finished.
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
    const accountResult = await client.query(
      "SELECT id FROM accounts WHERE id = $1 AND status = 'active'",
      [accountId]
    );
    if (accountResult.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    let reference = null;
    let inserted = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      reference = makeDepositReference();
      try {
        const result = await client.query(
          'INSERT INTO deposit_requests (account_id, reference, amount, currency, method, note, status) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at',
          [accountId, reference, amount, currency, method, note || null, 'pending']
        );
        inserted = result.rows[0];
      } catch (e) {
        if (e.code === '23505') continue; // reference collision: try another one
        throw e;
      }
    }
    if (!inserted) throw new Error('could not allocate a reference');
    return res.status(200).json({ ok: true, reference: reference, status: 'pending' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
}

module.exports = async function handler(req, res) {
  const op = req.query && typeof req.query.op === 'string' ? req.query.op : '';
  if (op === 'login') return handleClientLogin(req, res);
  if (op === 'approve') return handleClientApprove(req, res);
  if (op === 'request-deposit') return handleClientDepositRequest(req, res);
  return handleClientAccount(req, res);
};
