// POST /api/admin-transaction — record a deposit or withdrawal on a client account.
// RECORD-KEEPING ONLY: this site is not real banking and no money ever moves
// through it. This endpoint records a deposit or withdrawal that already
// happened at the bank itself (branch or counter); it only updates the
// recorded balance shown in the dashboard.
// Authorization: Bearer <token> (see _auth.js).
// Body (JSON): { account_id, type: deposit|withdrawal, amount, note }.
// Amount must be a number above zero with at most two decimals. The account
// must exist and be 'active' (on-hold accounts refuse every transaction),
// and a withdrawal must not take the balance below zero. The insert and the
// balance update happen in one database transaction, and the movement is
// also written to the linked application's history.
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const { validAmount } = require('./_money');

module.exports = async function handler(req, res) {
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
    return res.status(200).json({
      ok: true,
      balance: updated.rows[0].balance,
      currency: updated.rows[0].currency
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
};
