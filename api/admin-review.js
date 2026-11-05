// POST /api/admin-review — decide on an application.
// Authorization: Bearer <token> (see _auth.js).
// Body (JSON): { id, decision, note }.
// Decisions and the transitions they allow:
//   approved          pending -> approved            (emails the applicant)
//   rejected          pending -> rejected            (emails the applicant)
//   deposit_requested approved -> deposit_requested  (emails the applicant)
//   deposit_received  deposit_requested -> active    (emails the applicant)
//   reopened          approved|rejected -> pending   (no email)
// Every decision records an application_events row with the note, and updates
// status, admin_note and reviewed_at. When the email hook is not configured
// the decision still succeeds and the response notes email_sent: false.
// Required environment variable: DATABASE_URL.
// Optional email: see _mail.js (inert until SMTP env vars are set).
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const { notifyApplicantDecision } = require('./_mail');

// decision -> statuses it may move from
const ALLOWED_FROM = {
  approved: ['pending'],
  rejected: ['pending'],
  deposit_requested: ['approved'],
  deposit_received: ['deposit_requested'],
  reopened: ['approved', 'rejected']
};

// decision -> status the application moves to
const NEW_STATUS = {
  approved: 'approved',
  rejected: 'rejected',
  deposit_requested: 'deposit_requested',
  deposit_received: 'active',
  reopened: 'pending'
};

// decisions that email the applicant automatically
const EMAILS_APPLICANT = ['approved', 'rejected', 'deposit_requested', 'deposit_received'];

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
  if (!id || !ALLOWED_FROM[decision]) {
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
      'SELECT id, reference, first_name, last_name, email, status FROM applications WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = current.rows[0];
    if (ALLOWED_FROM[decision].indexOf(row.status) === -1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'invalid_transition' });
    }
    const newStatus = NEW_STATUS[decision];
    await client.query(
      'UPDATE applications SET status = $1, admin_note = $2, reviewed_at = now() WHERE id = $3',
      [newStatus, note || null, id]
    );
    await client.query(
      'INSERT INTO application_events (application_id, action, note) VALUES ($1, $2, $3)',
      [id, decision, note || null]
    );
    await client.query('COMMIT');

    let emailSent = false;
    if (EMAILS_APPLICANT.indexOf(decision) !== -1) {
      try {
        emailSent = await notifyApplicantDecision(
          { reference: row.reference, first_name: row.first_name, last_name: row.last_name, email: row.email },
          decision,
          note
        );
      } catch (e) {
        emailSent = false;
      }
    }
    return res.status(200).json({ ok: true, status: newStatus, email_sent: emailSent });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
};
