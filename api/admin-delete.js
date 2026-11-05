// POST /api/admin-delete — delete an application and its history.
// Authorization: Bearer <token> (see _auth.js).
// Body (JSON): { id }. The rows in application_events are removed with the
// application (ON DELETE CASCADE). This cannot be undone.
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.body && req.body.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const result = await pool.query('DELETE FROM applications WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
