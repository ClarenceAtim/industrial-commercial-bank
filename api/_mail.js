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
//   deposit_received  — deposit received, the account is now active
// Returns true when an email was actually sent, false otherwise (including
// when email is not configured). 'reopened' has no email: it returns false.
async function notifyApplicantDecision(application, decision, note) {
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
    if (note) text += '\nNote from the bank: ' + note + '\n';
    text += '\nOur team will contact you shortly with your account details.\n';
  } else {
    return false;
  }

  text += '\nIndustrial Commercial Bank';
  return sendMail({ from: process.env.SMTP_USER, to: application.email, subject, text });
}

module.exports = { notifyAdminNewApplication, notifyApplicantDecision };
