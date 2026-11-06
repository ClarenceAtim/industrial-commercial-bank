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

// Client tokens for the customer portal (client-login.html).
// No new secret is introduced: the same ADMIN_SECRET signs them, with a
// different scope string ("client") and a 2-hour lifetime, so a client token
// can never be mistaken for a staff token. The token carries only the
// account id and the expiry; the account is re-read from the database on
// every request, so a deleted account stops working at once.
// Tokens live in sessionStorage in the browser; nothing is stored server-side.
const CLIENT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function issueClientToken(accountId) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !Number.isInteger(accountId)) return null;
  const expiry = Date.now() + CLIENT_TOKEN_TTL_MS;
  const signature = crypto
    .createHmac('sha256', secret)
    .update('client:' + accountId + ':' + expiry, 'utf8')
    .digest('hex');
  return accountId + '.' + expiry + '.' + signature;
}

function verifyClientToken(token) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const accountId = Number(parts[0]);
  const expiry = Number(parts[1]);
  if (!Number.isInteger(accountId) || accountId <= 0) return null;
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;
  const expected = crypto
    .createHmac('sha256', secret)
    .update('client:' + accountId + ':' + expiry, 'utf8')
    .digest('hex');
  if (!safeEqual(parts[2], expected)) return null;
  return accountId;
}

// 4-digit client PINs (email + PIN sign-in).
// A PIN is exactly four digits, 0000-9999. Only a salted scrypt hash is
// ever stored, as "scrypt$<salt hex>$<hash hex>"; a plaintext PIN is
// never stored, logged or returned by any endpoint. Verification uses a
// timing-safe comparison and treats any malformed stored value as no match.
// The migration that adds the columns is
// sql/migrations/2026-11-06-client-pin-login.sql.
const PIN_SALT_BYTES = 16;
const PIN_KEY_BYTES = 64;

function validPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

function hashPin(pin) {
  const salt = crypto.randomBytes(PIN_SALT_BYTES);
  const hash = crypto.scryptSync(pin, salt, PIN_KEY_BYTES);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPin(pin, stored) {
  if (!validPin(pin) || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length !== PIN_SALT_BYTES || expected.length !== PIN_KEY_BYTES) return false;
    const actual = crypto.scryptSync(pin, salt, PIN_KEY_BYTES);
    return crypto.timingSafeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}

const PIN_MIGRATION_MESSAGE =
  'The PIN columns are missing: run sql/migrations/2026-11-06-client-pin-login.sql in the Neon SQL editor first.';

// True when all four PIN columns exist. `db` is a pool or a checked-out
// client — both expose query(text, params).
async function pinColumnsPresent(db) {
  const probe = await db.query(
    "SELECT table_name, column_name FROM information_schema.columns " +
      "WHERE (table_name = 'accounts' AND column_name IN ('pin_hash', 'failed_login_attempts', 'pin_locked_until')) " +
      "OR (table_name = 'applications' AND column_name = 'pin_hash')"
  );
  const found = {};
  probe.rows.forEach(function (row) { found[row.table_name + '.' + row.column_name] = true; });
  return Boolean(
    found['accounts.pin_hash'] &&
    found['accounts.failed_login_attempts'] &&
    found['accounts.pin_locked_until'] &&
    found['applications.pin_hash']
  );
}

// Returns the client account id from the request's Bearer token, or null.
function clientAccountId(req) {
  return verifyClientToken(bearerToken(req));
}

module.exports = { checkPassword, issueToken, verifyToken, bearerToken, requireAdmin, TOKEN_TTL_MS, issueClientToken, verifyClientToken, clientAccountId, CLIENT_TOKEN_TTL_MS, validPin, hashPin, verifyPin, pinColumnsPresent, PIN_MIGRATION_MESSAGE };
