// POST /api/admin-transfer-review — decide on a transfer request.
// Authorization: Bearer <token> (see _auth.js).
// Body (JSON): { id, decision, note }.
// Decisions and the transitions they allow:
//   approved  pending -> approved   (emails the requester: the transfer will be processed)
//   rejected  pending -> rejected   (emails the requester, politely, with the note)
// This only records the bank's decision. The transfer itself is processed
// offline by the bank; no money ever moves through this site.
// Every decision updates status, admin_note and reviewed_at. When the email
// hook is not configured the decision still succeeds and the response notes
// email_sent: false.
// Required environment variable: DATABASE_URL.
// Optional email: see _mail.js (inert until SMTP env vars are set).
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const { notifyTransferDecision } = require('./_mail');

const DECISIONS = ['approved', 'rejected'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const id = parseInt(body.id, 10);
  const decision = typeof body.decision === 'string' ? body.decision.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!id || DECISIONS.indexOf(decision) === -1) {
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
    const current = await client.query(
      'SELECT id, reference, sender_name, sender_email, destination_bank, ' +
        'destination_country, amount, currency, status FROM transfer_requests WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = current.rows[0];
    if (row.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'invalid_transition' });
    }
    await client.query(
      'UPDATE transfer_requests SET status = $1, admin_note = $2, reviewed_at = now() WHERE id = $3',
      [decision, note || null, id]
    );
    await client.query('COMMIT');

    let emailSent = false;
    try {
      emailSent = await notifyTransferDecision(
        {
          reference: row.reference,
          sender_name: row.sender_name,
          sender_email: row.sender_email,
          destination_bank: row.destination_bank,
          destination_country: row.destination_country,
          amount: row.amount,
          currency: row.currency
        },
        decision,
        note
      );
    } catch (e) {
      emailSent = false;
    }
    return res.status(200).json({ ok: true, status: decision, email_sent: emailSent });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
};
