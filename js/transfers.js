/* Industrial Commercial Bank — money-transfer request page (transfers.html).
   The client picks a destination bank from the published lists, or chooses
   "My bank is not listed" and types the bank name and country themselves,
   then submits a transfer REQUEST. This is not an instant transfer: the bank
   reviews the request and processes the transfer offline. No money ever moves
   through this site. Bank and country names are proper nouns and are shown
   as-is in every language. */
(function () {
  var DESTINATION_BANKS = {
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

  var REGIONS = ['africa', 'europe', 'america', 'asia'];
  var selected = null; // { region, name, country } or { region, manual: true }
  var currentRegion = 'africa';

  function t(key, fallback) {
    var d = window.__icbDict || {};
    return d[key] !== undefined ? d[key] : fallback;
  }
  function $(id) { return document.getElementById(id); }

  /* The signed-in client's token (same key js/client.js uses). Without
     it the backend refuses the request with 401. */
  function clientToken() {
    try { return sessionStorage.getItem('icb-client-token'); } catch (e) { return null; }
  }
  /* Session gone (expired or signed out elsewhere): clear it and send
     the client back to sign in, then return to this page. */
  function sessionExpired() {
    try {
      sessionStorage.removeItem('icb-client-token');
      sessionStorage.setItem('icb-client-expired', 'client_session_expired');
    } catch (e) {}
    window.location.href = 'client-login.html?next=transfers.html';
  }

  function renderBanks(region) {
    currentRegion = region;
    document.querySelectorAll('.region-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-region') === region);
    });
    var grid = $('bank-grid');
    grid.innerHTML = '';
    DESTINATION_BANKS[region].forEach(function (bank) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'bank-card' + (selected && selected.name === bank.name ? ' selected' : '');
      var title = document.createElement('h3');
      title.textContent = bank.name;
      var country = document.createElement('p');
      country.textContent = bank.country;
      card.appendChild(title);
      card.appendChild(country);
      card.addEventListener('click', function () { selectBank(region, bank); });
      grid.appendChild(card);
    });
    // "My bank is not listed": the client types the bank name and country.
    var manualCard = document.createElement('button');
    manualCard.type = 'button';
    manualCard.className = 'bank-card' + (selected && selected.manual ? ' selected' : '');
    var manualTitle = document.createElement('h3');
    manualTitle.textContent = t('trf_bank_not_listed', "Ma banque n'est pas dans la liste");
    manualCard.appendChild(manualTitle);
    manualCard.addEventListener('click', function () { selectManualBank(region); });
    grid.appendChild(manualCard);
  }

  function selectManualBank(region) {
    selected = { region: region, manual: true, name: '', country: '' };
    $('dest-bank').value = '';
    $('dest-region').value = region;
    $('dest-country').value = '';
    $('selected-bank-name').textContent = t('trf_bank_not_listed', "Ma banque n'est pas dans la liste");
    $('selected-bank').hidden = false;
    $('manual-bank-fields').hidden = false;
    renderBanks(currentRegion);
    $('manual-bank-fields').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectBank(region, bank) {
    selected = { region: region, name: bank.name, country: bank.country };
    $('dest-bank').value = bank.name;
    $('dest-region').value = region;
    $('dest-country').value = bank.country;
    $('manual-bank-fields').hidden = true;
    $('selected-bank-name').textContent = bank.name + ' — ' + bank.country;
    $('selected-bank').hidden = false;
    renderBanks(currentRegion);
    $('transfer-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearSelection() {
    selected = null;
    $('dest-bank').value = '';
    $('dest-region').value = '';
    $('dest-country').value = '';
    $('manual-bank-name').value = '';
    $('manual-bank-country').value = '';
    $('manual-bank-fields').hidden = true;
    $('selected-bank').hidden = true;
    renderBanks(currentRegion);
    $('region-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showError(message) {
    var errorBox = $('trf-error');
    $('trf-error-text').textContent = message;
    errorBox.classList.add('show');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderBanks('africa');
    document.querySelectorAll('.region-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        renderBanks(btn.getAttribute('data-region'));
      });
    });
    $('change-bank').addEventListener('click', clearSelection);

    var form = $('transfer-form');
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.textContent : '';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      $('trf-result').classList.remove('show');
      $('trf-error').classList.remove('show');

      if (!selected) {
        showError(t('trf_error_bank', "Choisissez d'abord une banque destinataire."));
        return;
      }
      var manualBank = !!selected.manual;
      if (manualBank) {
        var manualName = $('manual-bank-name').value.trim();
        var manualCountry = $('manual-bank-country').value.trim();
        if (!manualName || !manualCountry) {
          showError(t('trf_error_manual_bank', 'Indiquez le nom et le pays de votre banque.'));
          return;
        }
        $('dest-bank').value = manualName;
        $('dest-country').value = manualCountry;
      }
      var data = new FormData(form);
      var amount = parseFloat(data.get('amount'));
      if (!Number.isFinite(amount) || amount <= 0) {
        showError(t('trf_error_amount', 'Indiquez un montant valide supérieur à zéro.'));
        return;
      }

      var payload = {};
      ['sender_name', 'sender_email', 'sender_phone', 'account_number',
        'destination_bank', 'destination_region', 'destination_country',
        'recipient_name', 'recipient_account', 'purpose'].forEach(function (key) {
        payload[key] = String(data.get(key) || '').trim();
      });
      payload.amount = amount;
      payload.currency = String(data.get('currency') || 'USD').trim().toUpperCase() || 'USD';
      payload.manual_bank = manualBank;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t('trf_sending', 'Envoi en cours…');
      }

      fetch('/api/submit-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (clientToken() || '')
        },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          return r.json().then(function (body) { return { status: r.status, body: body }; });
        })
        .then(function (pair) {
          if (pair.status === 401) { sessionExpired(); return; }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
          }
          if (pair.body && pair.body.ok && pair.body.reference) {
            var ref = document.querySelector('[data-real-ref]');
            if (ref) ref.textContent = pair.body.reference;
            $('trf-result').classList.add('show');
            $('trf-result').scrollIntoView({ behavior: 'smooth', block: 'center' });
            form.reset();
            $('currency').value = 'USD';
            clearSelection();
          } else {
            var message = t('trf_error_text', 'Veuillez vérifier votre connexion et réessayer. Si le problème persiste, contactez la banque.');
            if (pair.body && pair.body.error === 'invalid_fields') {
              message = t('trf_error_amount', 'Indiquez un montant valide supérieur à zéro.');
            }
            showError(message);
          }
        })
        .catch(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
          }
          showError(t('trf_error_text', 'Veuillez vérifier votre connexion et réessayer. Si le problème persiste, contactez la banque.'));
        });
    });
  });
})();
