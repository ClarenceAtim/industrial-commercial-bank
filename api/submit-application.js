// POST /api/submit-application — receive a new account application.
// Body (JSON): first_name, last_name, dob (YYYY-MM-DD), nationality, phone,
// email, address, country (from the dropdown), id_type, id_number,
// account_type, plus optional id_photo_base64, id_photo_filename,
// id_photo_mimetype. Applicants under 17 must also send
// parent_guardian_name + parental_consent: true, or the application is
// rejected with underage_parental_approval.
// The ID photo must stay under 5 MB once decoded.
// Inserts a row with status 'pending' and a unique reference ICB-YYYY-XXXXXX.
// Returns { ok: true, reference }.
// Required environment variable: DATABASE_URL.
// Optional email notice: see _mail.js (inert until SMTP env vars are set).
// Never logs or returns sensitive data.
const crypto = require('crypto');
const { getPool } = require('./_db');
const { notifyAdminNewApplication } = require('./_mail');
const { validPin, hashPin, PIN_MIGRATION_MESSAGE } = require('./_auth');

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCOUNT_TYPES = ['current', 'savings', 'business'];
const ID_TYPES = ['id_card', 'passport', 'license'];

// Country of residence: chosen from a dropdown on the form.
const COUNTRIES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Andorra',
  'Angola',
  'Antigua and Barbuda',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Colombia',
  'Comoros',
  'Congo',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czech Republic',
  'Democratic Republic of the Congo',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Fiji',
  'Finland',
  'France',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Grenada',
  'Guatemala',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Honduras',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Ivory Coast',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kiribati',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Marshall Islands',
  'Mauritania',
  'Mauritius',
  'Mexico',
  'Micronesia',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nauru',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Palau',
  'Palestine',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'Sao Tome and Principe',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Africa',
  'South Korea',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Togo',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Tuvalu',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Vanuatu',
  'Vatican City',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
];

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

// Whole years of age on the day of submission (UTC calendar).
function ageFromDob(value) {
  if (!validDate(value)) return null;
  const parts = value.split('-').map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - parts[0];
  const m = now.getUTCMonth() + 1 - parts[1];
  if (m < 0 || (m === 0 && now.getUTCDate() < parts[2])) age--;
  return age;
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
    country: clean(body.country),
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
    !application.country ||
    !application.id_type ||
    !application.id_number ||
    !application.account_type;

  if (
    missing ||
    !validEmail(application.email) ||
    !validDate(application.dob) ||
    COUNTRIES.indexOf(application.country) === -1 ||
    ACCOUNT_TYPES.indexOf(application.account_type) === -1 ||
    ID_TYPES.indexOf(application.id_type) === -1
  ) {
    return res.status(400).json({ ok: false, error: 'invalid_fields' });
  }

  // Under 17, the account is rejected unless a parent or legal guardian
  // approved it: their full name and approval are both required.
  const age = ageFromDob(application.dob);
  const parentName = clean(body.parent_guardian_name).slice(0, 200);
  const parentConsent = body.parental_consent === true;
  let parental = null;
  if (age !== null && age < 17) {
    if (!parentName || !parentConsent) {
      return res.status(400).json({ ok: false, error: 'underage_parental_approval' });
    }
    parental = { name: parentName, consent: true };
  }

  // The client chooses a 4-digit PIN at sign-up; only its salted hash is
  // ever stored. The PIN is what they will sign in with later.
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const pinConfirm = typeof body.pin_confirm === 'string' ? body.pin_confirm.trim() : '';
  if (!validPin(pin) || pin !== pinConfirm) {
    return res.status(400).json({ ok: false, error: 'invalid_pin' });
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
    // The pin_hash column arrives with the 2026-11-06 PIN migration
    // (sql/migrations/2026-11-06-client-pin-login.sql). Until it has run,
    // fail with a clear error instead of a raw database error.
    const pinProbe = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'pin_hash'"
    );
    if (pinProbe.rows.length === 0) {
      return res.status(500).json({
        ok: false,
        error: 'migration_required',
        message: PIN_MIGRATION_MESSAGE
      });
    }
    // The country + parental-approval columns arrive with the
    // 2026-11-06 client-form migration
    // (sql/migrations/2026-11-06-client-form-updates.sql).
    const formProbe = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'applications' " +
        "AND column_name IN ('country', 'parent_guardian_name', 'parental_consent')"
    );
    if (formProbe.rows.length < 3) {
      return res.status(500).json({
        ok: false,
        error: 'migration_required',
        message: 'The client-form columns are missing: run sql/migrations/2026-11-06-client-form-updates.sql in the Neon SQL editor first.'
      });
    }
    await client.query('BEGIN');
    let reference = null;
    let inserted = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = makeReference();
      try {
        const result = await client.query(
          'INSERT INTO applications ' +
            '(reference, first_name, last_name, dob, nationality, phone, email, address, country, ' +
            'id_type, id_number, id_photo, id_photo_filename, id_photo_mimetype, account_type, status, pin_hash, ' +
            'parent_guardian_name, parental_consent) ' +
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id, created_at',
          [
            reference,
            application.first_name,
            application.last_name,
            application.dob,
            application.nationality,
            application.phone,
            application.email,
            application.address,
            application.country,
            application.id_type,
            application.id_number,
            photoBuffer,
            photoFilename,
            photoMimetype,
            application.account_type,
            'pending',
            hashPin(pin),
            parental ? parental.name : null,
            parental ? true : false
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
