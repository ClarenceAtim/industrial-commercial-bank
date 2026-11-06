/* Industrial Commercial Bank — client portal (client-login.html,
   client-account.html) and the client gate for the service pages.
   A customer signs in with their email address and the 4-digit PIN
   they chose when they applied (or the one the bank set for them).
   The 2-hour token lives in sessionStorage only.
   This page only ever shows the signed-in customer's own balance,
   movements and transfer requests, and lets them confirm a pending
   transfer request or ask the bank to record a deposit; the bank
   still reviews it afterwards. No money
   ever moves through this site.
   Gating: the service pages (transfers, loans, personal, business,
   digital) carry data-gated on <body>. Without a client token the
   visitor is sent to the sign-in page, which brings them back to the
   page they asked for after signing in. The gate is a convenience
   redirect — the APIs still check the token on every request. */
(function () {
  var TOKEN_KEY = 'icb-client-token';

  function t(key, fallback) {
    var d = window.__icbDict || {};
    return d[key] !== undefined ? d[key] : fallback;
  }
  function $(id) { return document.getElementById(id); }
  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(value) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }
  function show(el, visible) { if (el) el.hidden = !visible; }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString(window.__icbLang || 'fr', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(value); }
  }
  function formatMoney(value, currency) {
    if (value === null || value === undefined || value === '') return '—';
    var amount = Number(value);
    if (!Number.isFinite(amount)) return String(value);
    try {
      return amount.toLocaleString(window.__icbLang || 'fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (currency || '');
    } catch (e) { return amount.toFixed(2) + ' ' + (currency || ''); }
  }
  function statusLabel(status) {
    return {
      pending: t('admin_status_pending', 'En attente'),
      approved: t('admin_status_approved', 'Approuvée'),
      active: t('admin_status_active', 'Actif'),
      rejected: t('admin_status_rejected', 'Refusée')
    }[status] || status;
  }
  /* Only a plain same-site page name is ever accepted as a return target:
     no slashes, no protocol, no parent-directory tricks. */
  function safeNext(value) {
    if (!value || typeof value !== 'string') return null;
    try { value = decodeURIComponent(value); } catch (e) { return null; }
    if (!/^[A-Za-z0-9_-]+\.html$/.test(value)) return null;
    if (value === 'client-login.html') return null;
    return value;
  }
  function nextParam() {
    try {
      var params = new URLSearchParams(window.location.search);
      return safeNext(params.get('next'));
    } catch (e) { return null; }
  }
  function currentPage() {
    var page = window.location.pathname.split('/').pop();
    return page || 'index.html';
  }
  /* Gated service page: no client token, no service. Runs as soon as this
     script loads (it is included at the end of <body>), so the visitor is
     sent to sign-in before they can use the page. */
  function requireClientLogin() {
    if (!document.body || document.body.getAttribute('data-gated') !== 'true') return;
    if (token()) return;
    var target = 'client-login.html?next=' + encodeURIComponent(currentPage());
    window.location.replace(target);
  }
  /* Header and footer "Sign in" link follows the session: signed in it
     becomes "Sign out" (clears the token, back to the homepage); signed
     out it is a plain link to the sign-in page. */
  function updateNav() {
    var loggedIn = !!token();
    document.querySelectorAll('[data-nav-signin]').forEach(function (link) {
      if (loggedIn) {
        link.textContent = t('nav_signout', 'Se déconnecter');
        link.setAttribute('href', 'index.html');
        link.onclick = function (e) {
          e.preventDefault();
          setToken(null);
          window.location.href = 'index.html';
        };
      } else {
        link.textContent = t('nav_signin', 'Se connecter');
        link.setAttribute('href', 'client-login.html');
        link.onclick = null;
      }
    });
  }
  /* On the transfer page, a signed-in client's own account number is
     already known from their account view — prefill it and lock the field
     so the request is filed against the right account. The sign-in token
     carries no email address, so the email field is left for the client
     to fill in as before. */
  function prefillTransferForm() {
    var field = $('trf-account-number');
    if (!field || !$('transfer-form') || !token()) return;
    fetch('/api/client-account', { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (!r.ok) throw new Error('auth');
        return r.json();
      })
      .then(function (data) {
        if (data.ok && data.account && data.account.account_number) {
          field.value = data.account.account_number;
          field.readOnly = true;
        }
      })
      .catch(function () { /* leave the field editable if the session is stale */ });
  }
  function signOut(messageKey, fallback) {
    setToken(null);
    try {
      sessionStorage.setItem('icb-client-expired', messageKey || '');
    } catch (e) {}
    window.location.href = 'client-login.html';
  }

  function loadAccount() {
    show($('client-loading'), true);
    show($('client-error'), false);
    show($('client-ok'), false);
    fetch('/api/client-account', { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { signOut('client_session_expired'); throw new Error('auth'); }
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        show($('client-loading'), false);
        if (!data.ok) throw new Error('load');
        var acct = data.account;
        $('client-balance').textContent = formatMoney(acct.balance, acct.currency);
        $('client-status').textContent = statusLabel(acct.status);
        $('client-account-number').textContent = acct.account_number;
        $('client-ref').textContent = acct.reference;
        var txBody = $('client-tx-rows');
        txBody.innerHTML = '';
        (data.transactions || []).forEach(function (tx) {
          var tr = document.createElement('tr');
          var sign = tx.type === 'deposit' ? '+' : '−';
          tr.innerHTML =
            '<td>' + escapeHtml(formatDate(tx.created_at)) + '</td>' +
            '<td>' + escapeHtml(tx.type === 'deposit' ? t('admin_acct_tx_deposit', 'Dépôt') : t('admin_acct_tx_withdrawal', 'Retrait')) + '</td>' +
            '<td>' + escapeHtml(sign + ' ' + formatMoney(tx.amount, acct.currency)) + '</td>' +
            '<td>' + escapeHtml(tx.note || '—') + '</td>';
          txBody.appendChild(tr);
        });
        show($('client-tx-table'), (data.transactions || []).length > 0);
        show($('client-tx-empty'), (data.transactions || []).length === 0);
        var trfBody = $('client-trf-rows');
        trfBody.innerHTML = '';
        (data.transfers || []).forEach(function (trf) {
          var tr = document.createElement('tr');
          var bankLabel = trf.destination_bank + ' (' + trf.destination_country + ')';
          if (trf.is_manual_bank) bankLabel += ' — ' + t('admin_trf_manual', 'Banque saisie manuellement');
          var approval = trf.client_approved
            ? t('client_transfer_approved', 'Approuvé par vous')
            : t('client_transfer_pending_client', 'En attente de votre approbation');
          var action = '';
          if (trf.status === 'pending' && !trf.client_approved) {
            action = '<button type="button" class="btn" data-approve="' + trf.id + '">' +
              escapeHtml(t('client_transfer_approve', 'Approuver')) + '</button>';
          }
          tr.innerHTML =
            '<td>' + escapeHtml(trf.reference) + '</td>' +
            '<td>' + escapeHtml(bankLabel) + '</td>' +
            '<td>' + escapeHtml(formatMoney(trf.amount, trf.currency)) + '</td>' +
            '<td><span class="status-pill status-' + escapeHtml(trf.status) + '">' + escapeHtml(statusLabel(trf.status)) + '</span></td>' +
            '<td>' + escapeHtml(approval) + '</td>' +
            '<td>' + action + '</td>';
          trfBody.appendChild(tr);
        });
        show($('client-trf-table'), (data.transfers || []).length > 0);
        show($('client-trf-empty'), (data.transfers || []).length === 0);
        trfBody.querySelectorAll('[data-approve]').forEach(function (btn) {
          btn.addEventListener('click', function () { approveTransfer(btn); });
        });
        var depBody = $('client-dep-rows');
        depBody.innerHTML = '';
        (data.deposits || []).forEach(function (dep) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + escapeHtml(dep.reference) + '</td>' +
            '<td>' + escapeHtml(formatMoney(dep.amount, dep.currency)) + '</td>' +
            '<td>' + escapeHtml(depositMethodLabel(dep.method)) + '</td>' +
            '<td><span class="status-pill status-' + escapeHtml(dep.status) + '">' + escapeHtml(statusLabel(dep.status)) + '</span></td>' +
            '<td>' + escapeHtml(formatDate(dep.created_at)) + '</td>';
          depBody.appendChild(tr);
        });
        show($('client-dep-table'), (data.deposits || []).length > 0);
        show($('client-dep-empty'), (data.deposits || []).length === 0);
        var depCurrency = $('dep-currency');
        if (depCurrency && acct.currency) depCurrency.value = acct.currency;
        show($('client-view'), true);
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        show($('client-loading'), false);
        var err = $('client-error');
        err.textContent = t('client_load_error', 'Impossible de charger votre compte.');
        show(err, true);
      });
  }

  function depositMethodLabel(method) {
    return {
      bank_transfer: t('client_deposit_method_bank', 'Virement bancaire'),
      cash: t('client_deposit_method_cash', 'Espèces en agence'),
      mobile_money: t('client_deposit_method_mobile', 'Mobile money'),
      other: t('client_deposit_method_other', 'Autre')
    }[method] || method;
  }

  function requestDeposit() {
    var form = $('client-deposit-form');
    var amount = parseFloat($('dep-amount').value);
    show($('client-error'), false);
    show($('client-ok'), false);
    if (!Number.isFinite(amount) || amount <= 0) {
      var err = $('client-error');
      err.textContent = t('client_deposit_error', 'La demande n\'a pas pu être envoyée.');
      show(err, true);
      return;
    }
    fetch('/api/client-deposit-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: JSON.stringify({
        amount: amount,
        currency: $('dep-currency').value,
        method: $('dep-method').value,
        note: $('dep-note').value.trim()
      })
    })
      .then(function (r) {
        if (r.status === 401) { signOut('client_session_expired'); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'deposit');
        var ok = $('client-ok');
        ok.textContent = t('client_deposit_done', 'Demande envoyée. La banque l\'examine et ajoutera le montant à votre solde une fois approuvée.');
        show(ok, true);
        form.reset();
        loadAccount();
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var errBox = $('client-error');
        errBox.textContent = t('client_deposit_error', 'La demande n\'a pas pu être envoyée.');
        show(errBox, true);
      });
  }

  function approveTransfer(button) {
    var id = button.getAttribute('data-approve');
    button.disabled = true;
    show($('client-error'), false);
    show($('client-ok'), false);
    fetch('/api/client-transfer-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: JSON.stringify({ id: parseInt(id, 10) })
    })
      .then(function (r) {
        if (r.status === 401) { signOut('client_session_expired'); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'approve');
        var ok = $('client-ok');
        ok.textContent = t('client_approve_done', 'Demande approuvée. La banque l\'examine maintenant.');
        show(ok, true);
        loadAccount();
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        button.disabled = false;
        var err = $('client-error');
        err.textContent = t('client_approve_error', 'L\'approbation n\'a pas pu être enregistrée.');
        show(err, true);
      });
  }

  requireClientLogin();
  document.addEventListener('DOMContentLoaded', function () {
    updateNav();
    document.addEventListener('icb-lang', updateNav);
    prefillTransferForm();

    var loginForm = $('client-login-form');
    if (loginForm) {
      var next = nextParam();
      if (next) show($('client-login-next'), true);
      var expired = null;
      try { expired = sessionStorage.getItem('icb-client-expired'); sessionStorage.removeItem('icb-client-expired'); } catch (e) {}
      if (expired) {
        var box = $('client-login-error');
        var heading = box.querySelector('h3');
        if (heading) heading.textContent = t('client_session_expired', 'Votre session a expiré. Veuillez vous reconnecter.');
        box.classList.add('show');
      }
      if (token()) { window.location.href = next || 'client-account.html'; return; }
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var box = $('client-login-error');
        box.classList.remove('show');
        fetch('/api/client-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: $('client-email').value.trim(),
            pin: $('client-pin').value.trim()
          })
        })
          .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
          .then(function (pair) {
            if (!pair.data.ok || !pair.data.token) throw new Error(pair.data.error || 'login');
            setToken(pair.data.token);
            window.location.href = nextParam() || 'client-account.html';
          })
          .catch(function (err) {
            var heading = box.querySelector('h3');
            if (heading) {
              heading.textContent =
                err.message === 'pin_not_set' ? t('client_login_no_pin', 'Aucun code PIN n\'est encore défini pour ce compte. La banque doit d\'abord vous en attribuer un.') :
                err.message === 'pin_locked' ? t('client_login_locked', 'Trop de tentatives. Réessayez dans 15 minutes.') :
                err.message === 'migration_required' ? t('client_login_unavailable', 'La connexion est momentanément indisponible. Réessayez plus tard.') :
                t('client_login_error', 'L\'adresse e-mail ou le code PIN est incorrect.');
            }
            box.classList.add('show');
          });
      });
      return;
    }

    if ($('client-view')) {
      if (!token()) { window.location.href = 'client-login.html'; return; }
      $('client-logout').addEventListener('click', function () { signOut(); });
      var depositForm = $('client-deposit-form');
      if (depositForm) {
        depositForm.addEventListener('submit', function (e) {
          e.preventDefault();
          requestDeposit();
        });
      }
      loadAccount();
      document.addEventListener('icb-lang', loadAccount);
    }
  });
})();
