// Shared amount and currency checks for the accounts API.
// Amounts arrive as strings or numbers and are kept as strings with at most
// two decimals, so Postgres NUMERIC(19,2) stores them exactly; never do
// money arithmetic with floats in this codebase.
function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validAmount(value) {
  const text = typeof value === 'number' ? String(value) : clean(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = parseFloat(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

function validCurrency(value) {
  const text = clean(value).toUpperCase();
  if (text === '') return 'XAF';
  if (!/^[A-Z]{3}$/.test(text)) return null;
  return text;
}

module.exports = { validAmount, validCurrency };
