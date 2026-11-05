// POST /api/submit-transfer — receive a money-transfer request.
// This is a REQUEST flow only, not a real transfer: the bank reviews the
// request and processes the transfer offline. No money ever moves through
// this site. The client picks a destination bank from the published lists
// (see DESTINATION_BANKS) and submits the request; staff review it in the
// dashboard. Inserts a row with status 'pending' and a unique reference
// TRF-YYYY-XXXXXX. Returns { ok: true, reference }.
// Required environment variable: DATABASE_URL.
// Optional email notice: see _mail.js (inert until SMTP env vars are set).
// Never logs or returns sensitive data.
const { getPool } = require('./_db');
const { notifyAdminNewTransfer } = require('./_mail');
const { validAmount, validCurrency } = require('./_money');

// Top destination banks, by region. Bank and country names are proper
// nouns and are shown as-is in every language.
const DESTINATION_BANKS = {
  africa: [
    { name: 'Standard Bank', country: 'South Africa' },
    { name: 'First Bank of Nigeria', country: 'Nigeria' },
    { name: 'Access Bank', country: 'Nigeria' },
    { name: 'Zenith Bank', country: 'Nigeria' },
    { name: 'Attijariwafa Bank', country: 'Morocco' },
    { name: 'Ecobank', country: 'Togo' },
    { name: 'Absa Group', country: 'South Africa' },
    { name: 'Afriland First Bank', country: 'Cameroon' }
  ],
  europe: [
    { name: 'HSBC', country: 'United Kingdom' },
    { name: 'BNP Paribas', country: 'France' },
    { name: 'Deutsche Bank', country: 'Germany' },
    { name: 'Santander', country: 'Spain' },
    { name: 'Barclays', country: 'United Kingdom' },
    { name: 'UBS', country: 'Switzerland' },
    { name: 'Crédit Agricole', country: 'France' },
    { name: 'ING', country: 'Netherlands' }
  ],
  america: [
    { name: 'JPMorgan Chase', country: 'USA' },
    { name: 'Bank of America', country: 'USA' },
    { name: 'Wells Fargo', country: 'USA' },
    { name: 'Citibank', country: 'USA' },
    { name: 'Goldman Sachs', country: 'USA' },
    { name: 'Royal Bank of Canada', country: 'Canada' },
    { name: 'Scotiabank', country: 'Canada' },
    { name: 'Itaú Unibanco', country: 'Brazil' }
  ],
  asia: [
    { name: 'ICBC', country: 'China' },
    { name: 'China Construction Bank', country: 'China' },
    { name: 'Agricultural Bank of China', country: 'China' },
    { name: 'Bank of China', country: 'China' },
    { name: 'Mitsubishi UFJ Financial Group', country: 'Japan' },
    { name: 'DBS Bank', country: 'Singapore' },
    { name: 'State Bank of India', country: 'India' },
    { name: 'HDFC Bank', country: 'India' }
  ]
};

const REGIONS = ['africa', 'europe', 'america', 'asia'];

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function makeReference() {
  const year = new Date().getFullYear();
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return 'TRF-' + year + '-' + digits;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const transfer = {
    sender_name: clean(body.sender_name),
    sender_email: clean(body.sender_email),
    sender_phone: clean(body.sender_phone),
    account_number: clean(body.account_number),
    destination_bank: clean(body.destination_bank),
    destination_region: clean(body.destination_region),
    destination_country: clean(body.destination_country),
    recipient_name: clean(body.recipient_name),
    recipient_account: clean(body.recipient_account),
    purpose: clean(body.purpose)
  };
  const amount = validAmount(body.amount);
  const currency = validCurrency(body.currency);

  const regionBanks = REGIONS.indexOf(transfer.destination_region) !== -1
    ? DESTINATION_BANKS[transfer.destination_region]
    : null;
  const bankKnown = regionBanks
    ? regionBanks.some(function (b) {
        return b.name === transfer.destination_bank &&
          b.country === transfer.destination_country;
      })
    : false;

  const missing =
    !transfer.sender_name ||
    !transfer.sender_email ||
    !transfer.account_number ||
    !transfer.destination_bank ||
    !transfer.destination_region ||
    !transfer.recipient_name ||
    !transfer.recipient_account;

  if (
    missing ||
    !validEmail(transfer.sender_email) ||
    !amount ||
    !currency ||
    !bankKnown
  ) {
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
    let reference = null;
    let inserted = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = makeReference();
      try {
        const result = await client.query(
          'INSERT INTO transfer_requests ' +
            '(reference, sender_name, sender_email, sender_phone, account_number, ' +
            'destination_bank, destination_region, destination_country, recipient_name, ' +
            'recipient_account, amount, currency, purpose, status) ' +
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, created_at',
          [
            reference,
            transfer.sender_name,
            transfer.sender_email,
            transfer.sender_phone || null,
            transfer.account_number,
            transfer.destination_bank,
            transfer.destination_region,
            transfer.destination_country,
            transfer.recipient_name,
            transfer.recipient_account,
            amount,
            currency,
            transfer.purpose || null,
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
    // Best-effort notice to the bank; a mail failure must never fail the submission.
    notifyAdminNewTransfer({
      reference: reference,
      sender_name: transfer.sender_name,
      destination_bank: transfer.destination_bank,
      destination_country: transfer.destination_country,
      amount: amount,
      currency: currency,
      created_at: inserted.created_at
    }).catch(function () {});
    return res.status(200).json({ ok: true, reference: reference });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
};

module.exports.DESTINATION_BANKS = DESTINATION_BANKS;
