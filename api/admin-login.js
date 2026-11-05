// POST /api/admin-login — staff sign-in for the dashboard.
// Body (JSON): { password }.
// On success returns { ok: true, token, expires_in } where the token is valid
// for 8 hours. On failure always the same generic error, whatever went wrong.
// Required environment variables: ADMIN_PASSWORD, ADMIN_SECRET.
const { checkPassword, issueToken, TOKEN_TTL_MS } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const password = req.body && req.body.password;
  if (!checkPassword(password)) {
    return res.status(401).json({ ok: false, error: 'invalid' });
  }
  const token = issueToken();
  if (!token) {
    return res.status(401).json({ ok: false, error: 'invalid' });
  }
  return res.status(200).json({ ok: true, token, expires_in: Math.floor(TOKEN_TTL_MS / 1000) });
};
