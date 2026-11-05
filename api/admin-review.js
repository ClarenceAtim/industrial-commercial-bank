// POST /api/admin-review — decide on an application.
// Authorization: Bearer <token> (see _auth.js).
// Body (JSON): { id, decision, note }.
// Decisions and the transitions they allow:
//   approved          pending -> approved            (emails the applicant)
//   rejected          pending -> rejected            (emails the applicant)
//   deposit_requested approved -> deposit_requested  (emails the applicant)
//   deposit_received  deposit_requested -> active    (emails the applicant)
//     — the deposit amount (required) opens the client account: the account
//     is created with that first deposit as its opening balance, and the
//     account number is returned. This is record-keeping only: the deposit
//     itself happened at the bank, and the amount recorded here is what the
//     staff member received there. No money ever moves through this site.
//   reopened          approved|rejected -> pending   (no email)
// Every decision records an application_events row with the note, and updates
// status, admin_note and reviewed_at. When the email hook is not configured
// the decision still succeeds and the response notes email_sent: false.
// Required environment variable: DATABASE_URL.
// Optional email: see _mail.js (inert until SMTP env vars are set).
const crypto = require('crypto');
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');
const { notifyApplicantDecision } = require('./_mail');
const { validAmount, validCurrency } = require('./_money');

// A 10-digit account number starting with 1. Collisions are retried.
function makeAccountNumber() {
  let number = '1';
  for (let i = 0; i < 9; i++) number += String(crypto.randomInt(0, 10));
  return number;
}

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
  // Confirming a deposit opens the account, so the received amount is
  // required (currency defaults to XAF when not given).
  let depositAmount = null;
  let depositCurrency = 'XAF';
  if (decision === 'deposit_received') {
    depositAmount = validAmount(body.amount);
    depositCurrency = validCurrency(body.currency);
    if (!depositAmount || !depositCurrency) {
      return res.status(400).json({ ok: false, error: 'invalid_fields' });
    }
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
    let accountNumber = null;
    if (decision === 'deposit_received') {
      const existing = await client.query(
        'SELECT id FROM accounts WHERE application_id = $1',
        [id]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, error: 'account_exists' });
      }
      let account = null;
      for (let attempt = 0; attempt < 5 && !account; attempt++) {
        accountNumber = makeAccountNumber();
        try {
          const inserted = await client.query(
            'INSERT INTO accounts (application_id, account_number, currency, balance, status) ' +
              'VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [id, accountNumber, depositCurrency, depositAmount, 'active']
          );
          account = inserted.rows[0];
        } catch (e) {
          if (e.code === '23505') continue; // account number collision: try another one
          throw e;
        }
      }
      if (!account) throw new Error('could not allocate an account number');
      await client.query(
        'INSERT INTO transactions (account_id, type, amount, note) VALUES ($1, $2, $3, $4)',
        [account.id, 'deposit', depositAmount, note || null]
      );
    }
    await client.query('COMMIT');

    let emailSent = false;
    if (EMAILS_APPLICANT.indexOf(decision) !== -1) {
      try {
        emailSent = await notifyApplicantDecision(
          { reference: row.reference, first_name: row.first_name, last_name: row.last_name, email: row.email },
          decision,
          note,
          { amount: depositAmount, currency: depositCurrency, account_number: accountNumber }
        );
      } catch (e) {
        emailSent = false;
      }
    }
    const response = { ok: true, status: newStatus, email_sent: emailSent };
    if (decision === 'deposit_received') {
      response.account_number = accountNumber;
      response.balance = depositAmount;
      response.currency = depositCurrency;
    }
    return res.status(200).json(response);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
};
