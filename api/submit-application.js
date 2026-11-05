// POST /api/submit-application — receive a new account application.
// Body (JSON): first_name, last_name, dob (YYYY-MM-DD), nationality, phone,
// email, address, id_type, id_number, account_type, plus optional
// id_photo_base64, id_photo_filename, id_photo_mimetype.
// The ID photo must stay under 5 MB once decoded.
// Inserts a row with status 'pending' and a unique reference ICB-YYYY-XXXXXX.
// Returns { ok: true, reference }.
// Required environment variable: DATABASE_URL.
// Optional email notice: see _mail.js (inert until SMTP env vars are set).
// Never logs or returns sensitive data.
const crypto = require('crypto');
const { getPool } = require('./_db');
const { notifyAdminNewApplication } = require('./_mail');

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCOUNT_TYPES = ['current', 'savings', 'business'];
const ID_TYPES = ['id_card', 'passport', 'license'];

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function makeReference() {
  const year = new Date().getFullYear();
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return 'ICB-' + year + '-' + digits;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const application = {
    first_name: clean(body.first_name),
    last_name: clean(body.last_name),
    dob: clean(body.dob),
    nationality: clean(body.nationality),
    phone: clean(body.phone),
    email: clean(body.email),
    address: clean(body.address),
    id_type: clean(body.id_type),
    id_number: clean(body.id_number),
    account_type: clean(body.account_type)
  };

  const missing =
    !application.first_name ||
    !application.last_name ||
    !application.dob ||
    !application.nationality ||
    !application.phone ||
    !application.email ||
    !application.address ||
    !application.id_type ||
    !application.id_number ||
    !application.account_type;

  if (
    missing ||
    !validEmail(application.email) ||
    !validDate(application.dob) ||
    ACCOUNT_TYPES.indexOf(application.account_type) === -1 ||
    ID_TYPES.indexOf(application.id_type) === -1
  ) {
    return res.status(400).json({ ok: false, error: 'invalid_fields' });
  }

  let photoBuffer = null;
  let photoFilename = null;
  let photoMimetype = null;
  if (body.id_photo_base64) {
    if (typeof body.id_photo_base64 !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_photo' });
    }
    try {
      photoBuffer = Buffer.from(body.id_photo_base64, 'base64');
    } catch (e) {
      return res.status(400).json({ ok: false, error: 'invalid_photo' });
    }
    if (photoBuffer.length === 0 || photoBuffer.length > MAX_PHOTO_BYTES) {
      return res.status(400).json({ ok: false, error: 'photo_too_large' });
    }
    photoMimetype = clean(body.id_photo_mimetype);
    if (photoMimetype && photoMimetype !== 'application/pdf' && photoMimetype.indexOf('image/') !== 0) {
      return res.status(400).json({ ok: false, error: 'invalid_photo' });
    }
    photoFilename = clean(body.id_photo_filename).slice(0, 255) || null;
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
    let reference = null;
    let inserted = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = makeReference();
      try {
        const result = await client.query(
          'INSERT INTO applications ' +
            '(reference, first_name, last_name, dob, nationality, phone, email, address, ' +
            'id_type, id_number, id_photo, id_photo_filename, id_photo_mimetype, account_type, status) ' +
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, created_at',
          [
            reference,
            application.first_name,
            application.last_name,
            application.dob,
            application.nationality,
            application.phone,
            application.email,
            application.address,
            application.id_type,
            application.id_number,
            photoBuffer,
            photoFilename,
            photoMimetype,
            application.account_type,
            'pending'
          ]
        );
        inserted = result.rows[0];
        break;
      } catch (e) {
        if (e.code === '23505') continue; // reference collision: try another one
        throw e;
      }
    }
    if (!inserted) throw new Error('could not allocate a reference');
    await client.query(
      "INSERT INTO application_events (application_id, action) VALUES ($1, 'submitted')",
      [inserted.id]
    );
    await client.query('COMMIT');
    // Best-effort notice to the bank; a mail failure must never fail the submission.
    notifyAdminNewApplication({
      reference,
      first_name: application.first_name,
      last_name: application.last_name,
      account_type: application.account_type,
      created_at: inserted.created_at
    }).catch(() => {});
    return res.status(200).json({ ok: true, reference });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
};
