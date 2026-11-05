// POST /api/admin-hold — put a client account on hold or release the hold.
// Authorization: Bearer <token> (see _auth.js).
// Body (JSON): { account_id, action: hold|release, note }.
// A held account accepts no transactions (see admin-transaction.js) until
// the hold is released. Each change is written to the linked application's
// history. A hold cannot be placed on an already-held account, and a hold
// cannot be released on an account that is not held.
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

module.exports = async function handler(req, res) {
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
};
