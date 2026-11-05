// GET /api/admin-application?id= — one application with its history.
// Authorization: Bearer <token> (see _auth.js).
// Returns every field, the ID photo as base64 (when one was uploaded), and
// the history timeline from application_events (oldest first).
// Required environment variable: DATABASE_URL.
const { getPool } = require('./_db');
const { requireAdmin } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.query && req.query.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  try {
    const result = await pool.query(
      'SELECT id, reference, first_name, last_name, dob, nationality, phone, email, ' +
        'address, id_type, id_number, id_photo, id_photo_filename, id_photo_mimetype, ' +
        'account_type, status, admin_note, created_at, reviewed_at ' +
        'FROM applications WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = result.rows[0];
    const eventsResult = await pool.query(
      'SELECT action, note, created_at FROM application_events ' +
        'WHERE application_id = $1 ORDER BY created_at ASC, id ASC',
      [id]
    );
    const application = {
      id: row.id,
      reference: row.reference,
      first_name: row.first_name,
      last_name: row.last_name,
      dob: row.dob,
      nationality: row.nationality,
      phone: row.phone,
      email: row.email,
      address: row.address,
      id_type: row.id_type,
      id_number: row.id_number,
      id_photo_base64: row.id_photo ? row.id_photo.toString('base64') : null,
      id_photo_filename: row.id_photo_filename,
      id_photo_mimetype: row.id_photo_mimetype,
      account_type: row.account_type,
      status: row.status,
      admin_note: row.admin_note,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at
    };
    return res.status(200).json({ ok: true, application, events: eventsResult.rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
