// Optional email notifications for the account-application API.
// All SMTP settings are environment variables; when any of them is missing
// the functions below do nothing and never fail the request.
// Required when email is wanted: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// ADMIN_NOTIFY_EMAIL (where new-application notices go).
// The bank's own SMTP details have not been supplied yet, so this stays inert.

// Deposit details for the "request deposit" email. The client has not
// supplied these yet, so they are placeholders on purpose — fill in the real
// amount and payment details here before the deposit step goes live.
const DEPOSIT_AMOUNT = '[DEPOSIT AMOUNT — to be provided by the bank]';
const DEPOSIT_PAYMENT_DETAILS = '[PAYMENT DETAILS — to be provided by the bank]';

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  return transporter;
}

async function sendMail(mail) {
  const transport = getTransporter();
  if (!transport) return false;
  try {
    await transport.sendMail(mail);
    return true;
  } catch (e) {
    return false;
  }
}

// Short notice to the bank when a new application arrives.
async function notifyAdminNewApplication(application) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return false;
  const subject = 'New account application ' + application.reference;
  const text =
    'A new account application has been received.\n\n' +
    'Reference: ' + application.reference + '\n' +
    'Name: ' + application.first_name + ' ' + application.last_name + '\n' +
    'Account type: ' + application.account_type + '\n' +
    'Received: ' + application.created_at + '\n\n' +
    'Review it in the staff dashboard.';
  return sendMail({ from: process.env.SMTP_USER, to, subject, text });
}

// Decision email to the applicant. One of:
//   approved          — application approved, what happens next
//   rejected          — application not approved, politely, with the admin note
//   deposit_requested — please pay the initial deposit (amount + payment details)
//   deposit_received  — deposit received, the account is now active; the email
//     states the recorded amount, the currency and the new account number
//     (passed in `extra`: { amount, currency, account_number }).
// Returns true when an email was actually sent, false otherwise (including
// when email is not configured). 'reopened' has no email: it returns false.
async function notifyApplicantDecision(application, decision, note, extra) {
  if (!application.email) return false;
  const name = application.first_name + ' ' + application.last_name;
  const ref = application.reference;
  let subject;
  let text;

  if (decision === 'approved') {
    subject = 'Your account application ' + ref + ' — approved';
    text =
      'Dear ' + name + ',\n\n' +
      'Good news: your account application with reference ' + ref + ' has been approved.\n\n' +
      'The next step is the initial deposit. Our team will contact you shortly with the deposit details and the steps to activate your account.\n';
  } else if (decision === 'rejected') {
    subject = 'Your account application ' + ref + ' — decision';
    text =
      'Dear ' + name + ',\n\n' +
      'Thank you for your application with reference ' + ref + '. After review, we are unfortunately not able to approve it at this time.\n';
    if (note) text += '\nNote from the bank: ' + note + '\n';
    text += '\nIf you have any questions, please contact the bank.\n';
  } else if (decision === 'deposit_requested') {
    subject = 'Your account application ' + ref + ' — initial deposit';
    text =
      'Dear ' + name + ',\n\n' +
      'Your account application with reference ' + ref + ' has been approved. To activate your account, please pay the initial deposit:\n\n' +
      'Amount: ' + DEPOSIT_AMOUNT + '\n' +
      'Payment details: ' + DEPOSIT_PAYMENT_DETAILS + '\n';
    if (note) text += '\nNote from the bank: ' + note + '\n';
    text += '\nPlease use your reference ' + ref + ' with your payment so we can match it to your application. Once the deposit is received, your account will be activated.\n';
  } else if (decision === 'deposit_received') {
    subject = 'Your account application ' + ref + ' — account active';
    text =
      'Dear ' + name + ',\n\n' +
      'Thank you: we have received your initial deposit for application ' + ref + '. Your account is now active.\n';
    if (extra && extra.amount) {
      text += '\nDeposit received: ' + extra.amount + ' ' + (extra.currency || 'XAF') + '\n';
    }
    if (extra && extra.account_number) {
      text += 'Your account number: ' + extra.account_number + '\n';
    }
    if (note) text += '\nNote from the bank: ' + note + '\n';
    text += '\nOur team will contact you shortly with your account details.\n';
  } else {
    return false;
  }

  text += '\nIndustrial Commercial Bank';
  return sendMail({ from: process.env.SMTP_USER, to: application.email, subject, text });
}

// Short notice to the bank when a new transfer request arrives.
async function notifyAdminNewTransfer(transfer) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return false;
  const subject = 'New transfer request ' + transfer.reference;
  const text =
    'A new transfer request has been received.\n\n' +
    'Reference: ' + transfer.reference + '\n' +
    'Sender: ' + transfer.sender_name + '\n' +
    'Destination bank: ' + transfer.destination_bank + ' (' + transfer.destination_country + ')\n' +
    'Amount: ' + transfer.amount + ' ' + transfer.currency + '\n' +
    'Received: ' + transfer.created_at + '\n\n' +
    'Review it in the staff dashboard. This is a request only: the transfer ' +
    'itself is processed offline by the bank.';
  return sendMail({ from: process.env.SMTP_USER, to, subject, text });
}

// Decision email for a transfer request. One of:
//   approved — the request is approved and the transfer will be processed
//   rejected — the request is not approved, politely, with the admin note
// Returns true when an email was actually sent, false otherwise (including
// when email is not configured).
async function notifyTransferDecision(transfer, decision, note) {
  if (!transfer.sender_email) return false;
  const ref = transfer.reference;
  let subject;
  let text;

  if (decision === 'approved') {
    subject = 'Your transfer request ' + ref + ' — approved';
    text =
      'Dear ' + transfer.sender_name + ',\n\n' +
      'Good news: your transfer request with reference ' + ref + ' has been approved.\n\n' +
      'Destination bank: ' + transfer.destination_bank + ' (' + transfer.destination_country + ')\n' +
      'Amount: ' + transfer.amount + ' ' + transfer.currency + '\n\n' +
      'Our team will now process the transfer. We will contact you if anything else is needed.\n';
  } else if (decision === 'rejected') {
    subject = 'Your transfer request ' + ref + ' — decision';
    text =
      'Dear ' + transfer.sender_name + ',\n\n' +
      'Thank you for your transfer request with reference ' + ref + '. After review, we are unfortunately not able to approve it at this time.\n';
    if (note) text += '\nNote from the bank: ' + note + '\n';
    text += '\nIf you have any questions, please contact the bank.\n';
  } else {
    return false;
  }

  text += '\nIndustrial Commercial Bank';
  return sendMail({ from: process.env.SMTP_USER, to: transfer.sender_email, subject, text });
}

module.exports = { notifyAdminNewApplication, notifyApplicantDecision, notifyAdminNewTransfer, notifyTransferDecision };
