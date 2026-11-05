/* Industrial Commercial Bank — calculators (frontend JS only, no live data) */
function fmt(n, digits) {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits === undefined ? 2 : digits });
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
  out.innerHTML = 'Monthly payment: <strong>' + fmt(m) + '</strong><br>' +
    'Total repaid: <strong>' + fmt(total) + '</strong> &nbsp;|&nbsp; Total interest: <strong>' + fmt(total - P) + '</strong>';
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
  out.innerHTML = 'Estimated balance after ' + years + ' years: <strong>' + fmt(fv) + '</strong><br>' +
    'You contribute: <strong>' + fmt(paid) + '</strong> &nbsp;|&nbsp; Estimated interest: <strong>' + fmt(fv - paid) + '</strong>';
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
    '<small>Indicative rates only — not a live quote. Final rates are confirmed at the branch or in the app.</small>';
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
});
