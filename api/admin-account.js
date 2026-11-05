// GET /api/admin-account?id= (or ?application_id=) — one client account.
// DELETE /api/admin-account?id= — delete a client account.
// RECORD-KEEPING ONLY: this site is not real banking and no money ever moves
// through it. The balance shown here is a record of deposits and withdrawals
// that happened at the bank itself; staff record them here so the dashboard
// shows what the account holds.
// Authorization: Bearer <token> (see _auth.js).
// GET returns the account, the linked client/application fields, and the full
// transaction history (newest first). Balances and amounts are NUMERIC strings.
// DELETE removes the account and its transactions, and records an
// 'account_deleted' event on the application. It is only allowed when the
// balance is exactly 0 (409 nonzero_balance) and the account is not on hold
// (409 account_on_hold — release the hold first). Deleting an account does
// not delete the application.
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

async function handleGet(req, res) {
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
        'a.status, a.created_at, a.updated_at, ap.reference, ap.first_name, ' +
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

async function handleDelete(req, res) {
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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;
  if (req.method === 'GET') return handleGet(req, res);
  return handleDelete(req, res);
};
