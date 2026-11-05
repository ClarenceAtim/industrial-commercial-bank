// POST /api/client-transfer-approve — a signed-in customer confirms one of
// their own PENDING transfer requests.
// Authorization: Bearer <client token> (see _auth.js). The request must
// belong to the account named by the token; a request belonging to any other
// account is answered 404, exactly as if it did not exist.
// Approving here only records that the client confirmed the request
// (client_approved = true). The bank still reviews the request afterwards
// in the staff dashboard, and the transfer itself is processed offline by
// the bank; no money ever moves through this site.
// The client_approved column arrives with the 2026-11-05 client-portal
// migration (sql/migrations/2026-11-05-client-portal.sql). If the migration
// has not run yet, this endpoint fails with a clear 500 naming the missing
// column instead of recording anything half-finished.
// Required environment variables: DATABASE_URL, ADMIN_SECRET.
const { getPool } = require('./_db');
const { clientAccountId } = require('./_auth');

module.exports = async function handler(req, res) {
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
};
