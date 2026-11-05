// Staff token handling for the admin API.
// Required environment variables: ADMIN_PASSWORD, ADMIN_SECRET.
// The token is HMAC-SHA256(ADMIN_SECRET, "admin:<expiry-ms>"), valid 8 hours.
// Tokens live in memory only (sessionStorage in the browser); nothing is stored server-side.
const crypto = require('crypto');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== 'string') return false;
  return safeEqual(sha256Hex(password), sha256Hex(expected));
}

function issueToken() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  const expiry = Date.now() + TOKEN_TTL_MS;
  const signature = crypto
    .createHmac('sha256', secret)
    .update('admin:' + expiry, 'utf8')
    .digest('hex');
  return expiry + '.' + signature;
}

function verifyToken(token) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expiry = Number(parts[0]);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update('admin:' + expiry, 'utf8')
    .digest('hex');
  return safeEqual(parts[1], expected);
}

function bearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function requireAdmin(req, res) {
  if (!verifyToken(bearerToken(req))) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

module.exports = { checkPassword, issueToken, verifyToken, bearerToken, requireAdmin, TOKEN_TTL_MS };
