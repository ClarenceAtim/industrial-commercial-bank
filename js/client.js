/* Industrial Commercial Bank — client portal (client-login.html,
   client-account.html). A customer signs in with the three things they
   already received from the bank — account number, application reference
   and email address — no password to remember. The 2-hour token lives in
   sessionStorage only. This page only ever shows the signed-in customer's
   own balance, movements and transfer requests, and lets them confirm a
   pending transfer request; the bank still reviews it afterwards. No money
   ever moves through this site. */
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

  document.addEventListener('DOMContentLoaded', function () {
    var loginForm = $('client-login-form');
    if (loginForm) {
      var expired = null;
      try { expired = sessionStorage.getItem('icb-client-expired'); sessionStorage.removeItem('icb-client-expired'); } catch (e) {}
      if (expired) {
        var box = $('client-login-error');
        var heading = box.querySelector('h3');
        if (heading) heading.textContent = t('client_session_expired', 'Votre session a expiré. Veuillez vous reconnecter.');
        box.classList.add('show');
      }
      if (token()) { window.location.href = 'client-account.html'; return; }
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var box = $('client-login-error');
        box.classList.remove('show');
        fetch('/api/client-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_number: $('client-account-number').value.trim(),
            reference: $('client-reference').value.trim(),
            email: $('client-email').value.trim()
          })
        })
          .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
          .then(function (pair) {
            if (!pair.data.ok || !pair.data.token) throw new Error('login');
            setToken(pair.data.token);
            window.location.href = 'client-account.html';
          })
          .catch(function () {
            var heading = box.querySelector('h3');
            if (heading) heading.textContent = t('client_login_error', 'Ces informations ne correspondent à aucun compte actif.');
            box.classList.add('show');
          });
      });
      return;
    }

    if ($('client-view')) {
      if (!token()) { window.location.href = 'client-login.html'; return; }
      $('client-logout').addEventListener('click', function () { signOut(); });
      loadAccount();
      document.addEventListener('icb-lang', loadAccount);
    }
  });
})();
