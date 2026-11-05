// POST /api/client-login — sign a customer in to their account view.
// No password is involved: the customer proves who they are with the three
// things they already received from the bank when their account was created
// — their account number, their application reference number, and the email
// address on the application. All three must match an ACTIVE account, and
// the reply never says which one was wrong.
// On success returns a 2-hour HMAC token (client scope, signed with the
// same ADMIN_SECRET as the staff tokens — no new environment variable;
// see _auth.js). The token carries only the account id; the account is
// re-read from the database on every request.
// Required environment variables: DATABASE_URL, ADMIN_SECRET.
const { getPool } = require('./_db');
const { issueClientToken } = require('./_auth');

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const accountNumber = clean(body.account_number);
  const reference = clean(body.reference).toUpperCase();
  const email = clean(body.email).toLowerCase();
  if (!accountNumber || !reference || !email) {
    return res.status(400).json({ ok: false, error: 'invalid_fields' });
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const result = await pool.query(
      'SELECT a.id FROM accounts a JOIN applications ap ON ap.id = a.application_id ' +
        'WHERE a.account_number = $1 AND ap.reference = $2 AND lower(ap.email) = $3 ' +
        "AND a.status = 'active'",
      [accountNumber, reference, email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const token = issueClientToken(result.rows[0].id);
    if (!token) {
      return res.status(500).json({ ok: false, error: 'server_error' });
    }
    return res.status(200).json({ ok: true, token: token });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
