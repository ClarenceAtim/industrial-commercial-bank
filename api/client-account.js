// GET /api/client-account — the signed-in customer's own account view.
// Authorization: Bearer <client token> (see _auth.js — 2-hour token issued
// by /api/client-login). The token names exactly one account, and this
// endpoint returns ONLY that account: its balance and status, its own
// transactions, and its own transfer requests. No other account's data can
// be reached through it, whatever id is passed in the query.
// RECORD-KEEPING ONLY: this site is not real banking and no money ever
// moves through it. The balance shown here is the record of deposits and
// withdrawals that happened at the bank itself.
// The client_approved / is_manual_bank transfer flags arrive with the
// 2026-11-05 client-portal migration (sql/migrations/2026-11-05-client-portal.sql);
// until it has run they read as false and the endpoint still works.
// Required environment variables: DATABASE_URL, ADMIN_SECRET.
const { getPool } = require('./_db');
const { clientAccountId } = require('./_auth');

module.exports = async function handler(req, res) {
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
      transfers: trfResult.rows
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
