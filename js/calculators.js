/* Industrial Commercial Bank — calculators (frontend JS only, no live data) */
function fmt(n, digits) {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits === undefined ? 2 : digits });
}

/* Dictionary lookup with a French fallback (French is the page default). */
function t(key, fallback) {
  var d = window.__icbDict;
  return (d && d[key] !== undefined) ? d[key] : fallback;
}

function loanCalc() {
  var P = parseFloat(document.getElementById('loan-amount').value) || 0;
  var annual = parseFloat(document.getElementById('loan-rate').value) || 0;
  var n = parseInt(document.getElementById('loan-term').value, 10) || 0;
  var out = document.getElementById('loan-result');
  if (!P || !n) { out.innerHTML = ''; return; }
  var r = annual / 100 / 12;
  var m = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  var total = m * n;
  out.innerHTML = t('calc_monthly', 'Mensualité : ') + '<strong>' + fmt(m) + '</strong><br>' +
    t('calc_total', 'Total remboursé : ') + '<strong>' + fmt(total) + '</strong> &nbsp;|&nbsp; ' + t('calc_interest', 'Total des intérêts : ') + '<strong>' + fmt(total - P) + '</strong>';
}

function savingsCalc() {
  var start = parseFloat(document.getElementById('sav-start').value) || 0;
  var monthly = parseFloat(document.getElementById('sav-monthly').value) || 0;
  var annual = parseFloat(document.getElementById('sav-rate').value) || 0;
  var years = parseFloat(document.getElementById('sav-years').value) || 0;
  var out = document.getElementById('sav-result');
  if (!years) { out.innerHTML = ''; return; }
  var r = annual / 100 / 12, n = years * 12, fv = start * Math.pow(1 + r, n);
  if (r > 0) fv += monthly * (Math.pow(1 + r, n) - 1) / r; else fv += monthly * n;
  var paid = start + monthly * n;
  out.innerHTML = t('calc_balance', 'Solde estimé après ') + years + t('calc_years_suffix', ' ans : ') + '<strong>' + fmt(fv) + '</strong><br>' +
    t('calc_contrib', 'Vous apportez : ') + '<strong>' + fmt(paid) + '</strong> &nbsp;|&nbsp; ' + t('calc_est_interest', 'Intérêts estimés : ') + '<strong>' + fmt(fv - paid) + '</strong>';
}

/* Static indicative rates only — clearly labelled, not live market data. */
var INDICATIVE_RATES = { XAF: 1, EUR: 655.957, USD: 600, NGN: 0.40 };

function convertCurrency() {
  var amount = parseFloat(document.getElementById('fx-amount').value) || 0;
  var from = document.getElementById('fx-from').value;
  var to = document.getElementById('fx-to').value;
  var out = document.getElementById('fx-result');
  if (!amount) { out.innerHTML = ''; return; }
  var inXaf = amount * INDICATIVE_RATES[from];
  var result = inXaf / INDICATIVE_RATES[to];
  out.innerHTML = fmt(amount) + ' ' + from + ' ≈ <strong>' + fmt(result) + ' ' + to + '</strong><br>' +
    '<small>' + t('per_fx_note', "Taux indicatifs uniquement — ce ne sont pas des cotations en direct. Les taux définitifs sont confirmés en agence ou dans l'application.") + '</small>';
}

document.addEventListener('DOMContentLoaded', function () {
  ['loan-amount', 'loan-rate', 'loan-term'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', loanCalc);
  });
  ['sav-start', 'sav-monthly', 'sav-rate', 'sav-years'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', savingsCalc);
  });
  ['fx-amount', 'fx-from', 'fx-to'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', convertCurrency);
    if (el) el.addEventListener('change', convertCurrency);
  });
  /* Re-render calculator outputs when the site language changes. */
  document.addEventListener('icb-lang', function () {
    if (document.getElementById('loan-amount')) loanCalc();
    if (document.getElementById('sav-start')) savingsCalc();
    if (document.getElementById('fx-amount')) convertCurrency();
  });
});
