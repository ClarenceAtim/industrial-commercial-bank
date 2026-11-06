/* Industrial Commercial Bank — staff dashboard (admin.html) */
(function () {
  var TOKEN_KEY = 'icb-admin-token';
  var state = { view: 'applications', page: 1, sort: 'created_at', order: 'desc', detailId: null, deleteArmed: false, acctPage: 1, acctSort: 'created_at', acctOrder: 'desc', acctDetailId: null, acctHoldArmed: false, trfPage: 1, trfSort: 'created_at', trfOrder: 'desc', trfDetailId: null, depPage: 1, depSort: 'created_at', depOrder: 'desc', depDetailId: null };

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
  function headers() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() };
  }
  function show(el, visible) { el.hidden = !visible; }
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
  function acctStatusLabel(status) {
    return {
      active: t('admin_status_active', 'Actif'),
      on_hold: t('admin_acct_status_hold', 'Bloqué')
    }[status] || status;
  }
  function statusLabel(status) {
    return {
      pending: t('admin_status_pending', 'En attente'),
      approved: t('admin_status_approved', 'Approuvée'),
      deposit_requested: t('admin_status_deposit', 'Dépôt demandé'),
      active: t('admin_status_active', 'Actif'),
      rejected: t('admin_status_rejected', 'Refusée')
    }[status] || status;
  }
  function accountLabel(value) {
    return {
      current: t('open_acct_current', 'Compte courant — Particulier'),
      savings: t('open_acct_savings', "Compte d'épargne — Particulier"),
      business: t('open_acct_biz', 'Compte professionnel — Entreprise')
    }[value] || value;
  }
  function idTypeLabel(value) {
    return {
      id_card: t('open_id_card', "Carte nationale d'identité"),
      passport: t('open_id_passport', 'Passeport'),
      license: t('open_id_license', 'Permis de conduire')
    }[value] || value;
  }
  function eventLabel(action) {
    return {
      submitted: t('admin_event_submitted', 'Demande envoyée'),
      approved: t('admin_event_approved', 'Approuvée'),
      rejected: t('admin_event_rejected', 'Refusée'),
      deposit_requested: t('admin_event_deposit_requested', 'Dépôt demandé'),
      deposit_received: t('admin_event_deposit_received', 'Dépôt reçu — compte actif'),
      deposit_recorded: t('admin_event_deposit_recorded', 'Dépôt enregistré'),
      withdrawal_recorded: t('admin_event_withdrawal_recorded', 'Retrait enregistré'),
      account_created: t('admin_event_account_created', 'Compte créé'),
      account_deleted: t('admin_event_account_deleted', 'Compte supprimé'),
      account_hold: t('admin_event_account_hold', 'Compte bloqué'),
      account_released: t('admin_event_account_released', 'Compte débloqué'),
      reopened: t('admin_event_reopened', 'Rouverte')
    }[action] || action;
  }
  function authFailed() {
    setToken(null);
    show($('admin-panel'), false);
    show($('admin-login'), true);
    var err = $('admin-login-error');
    err.textContent = t('admin_login_error', 'Mot de passe incorrect.');
    show(err, true);
  }

  function currentFilters() {
    return {
      search: $('admin-search').value.trim(),
      status: $('admin-filter-status').value,
      account_type: $('admin-filter-account').value,
      date_from: $('admin-date-from').value,
      date_to: $('admin-date-to').value,
      sort: state.sort,
      order: state.order,
      page: state.page
    };
  }

  function loadList() {
    var f = currentFilters();
    var params = new URLSearchParams();
    Object.keys(f).forEach(function (k) { if (f[k] !== '' && f[k] !== null) params.set(k, f[k]); });
    show($('admin-loading'), true);
    show($('admin-load-error'), false);
    fetch('/api/admin-applications?' + params.toString(), { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        show($('admin-loading'), false);
        if (!data.ok) throw new Error('load');
        var stats = data.stats || {};
        $('stat-total').textContent = stats.total != null ? stats.total : '—';
        $('stat-pending').textContent = stats.pending != null ? stats.pending : '—';
        $('stat-approved').textContent = stats.approved != null ? stats.approved : '—';
        $('stat-deposit').textContent = stats.deposit_requested != null ? stats.deposit_requested : '—';
        $('stat-active').textContent = stats.active != null ? stats.active : '—';
        $('stat-rejected').textContent = stats.rejected != null ? stats.rejected : '—';
        $('stat-month').textContent = stats.this_month != null ? stats.this_month : '—';
        var rows = data.applications || [];
        var tbody = $('admin-rows');
        tbody.innerHTML = '';
        rows.forEach(function (app) {
          var tr = document.createElement('tr');
          tr.className = 'clickable-row';
          tr.innerHTML =
            '<td data-label="' + escapeHtml(t('admin_col_ref', 'Référence')) + '">' + escapeHtml(app.reference) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_col_name', 'Nom')) + '">' + escapeHtml(app.last_name + ' ' + app.first_name) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_col_account', 'Compte')) + '">' + escapeHtml(accountLabel(app.account_type)) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_col_status', 'Statut')) + '"><span class="status-pill status-' + escapeHtml(app.status) + '">' + escapeHtml(statusLabel(app.status)) + '</span></td>' +
            '<td data-label="' + escapeHtml(t('admin_col_date', 'Date')) + '">' + escapeHtml(formatDate(app.created_at)) + '</td>';
          tr.addEventListener('click', function () { openDetail(app.id); });
          tbody.appendChild(tr);
        });
        show($('admin-table'), rows.length > 0);
        show($('admin-empty'), rows.length === 0);
        show($('admin-pager'), data.total_pages > 1);
        $('admin-page-label').textContent = data.page + ' ' + t('admin_page_of', 'sur') + ' ' + data.total_pages;
        $('admin-prev').disabled = data.page <= 1;
        $('admin-next').disabled = data.page >= data.total_pages;
        document.querySelectorAll('.sort-btn').forEach(function (btn) {
          btn.dataset.dir = (btn.dataset.sort === state.sort) ? state.order : '';
        });
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        show($('admin-loading'), false);
        var err = $('admin-load-error');
        err.textContent = t('admin_load_error', 'Impossible de charger les demandes.');
        show(err, true);
      });
  }

  function openDetail(id) {
    state.detailId = id;
    state.deleteArmed = false;
    show($('detail-error'), false);
    show($('detail-ok'), false);
    $('deposit-amount').value = '';
    $('deposit-currency').value = 'USD';
    $('deposit-pin').value = '';
    fetch('/api/admin-application?id=' + id, { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error('load');
        var app = data.application;
        $('detail-ref').textContent = app.reference + ' — ' + app.last_name + ' ' + app.first_name;
        var fields = [
          [t('open_first_name', 'Prénom'), app.first_name],
          [t('open_last_name', 'Nom de famille'), app.last_name],
          [t('open_dob', 'Date de naissance'), app.dob ? String(app.dob).slice(0, 10) : ''],
          [t('open_nationality', 'Nationalité'), app.nationality],
          [t('con_phone_title', 'Téléphone'), app.phone],
          [t('open_email', 'Adresse e-mail'), app.email],
          [t('open_home_address', 'Adresse de résidence'), app.address],
          [t('open_id_type', 'Type de pièce'), idTypeLabel(app.id_type)],
          [t('open_id_number', 'Numéro de la pièce'), app.id_number],
          [t('open_acct_type', 'Type de compte souhaité'), accountLabel(app.account_type)],
          [t('admin_col_status', 'Statut'), statusLabel(app.status)],
          [t('admin_created', 'Envoyée le'), formatDate(app.created_at)],
          [t('admin_reviewed', 'Dernière décision le'), formatDate(app.reviewed_at)],
          [t('admin_note_label', 'Note interne'), app.admin_note || '—']
        ];
        var dl = $('detail-fields');
        dl.innerHTML = '';
        fields.forEach(function (pair) {
          var dt = document.createElement('dt');
          dt.textContent = pair[0];
          var dd = document.createElement('dd');
          dd.textContent = pair[1];
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
        var img = $('detail-photo');
        var noPhoto = $('detail-no-photo');
        if (app.id_photo_base64 && app.id_photo_mimetype && app.id_photo_mimetype.indexOf('image/') === 0) {
          img.src = 'data:' + app.id_photo_mimetype + ';base64,' + app.id_photo_base64;
          img.alt = app.id_photo_filename || '';
          show(img, true);
          show(noPhoto, false);
        } else if (app.id_photo_base64) {
          img.removeAttribute('src');
          show(img, false);
          noPhoto.innerHTML = '';
          var link = document.createElement('a');
          link.href = 'data:' + (app.id_photo_mimetype || 'application/octet-stream') + ';base64,' + app.id_photo_base64;
          link.download = app.id_photo_filename || 'piece-identite';
          link.textContent = t('admin_open_doc', 'Ouvrir le document') +
            (app.id_photo_filename ? ' (' + app.id_photo_filename + ')' : '');
          noPhoto.appendChild(link);
          show(noPhoto, true);
        } else {
          img.removeAttribute('src');
          show(img, false);
          noPhoto.textContent = t('admin_no_photo', 'Aucune photo fournie.');
          show(noPhoto, true);
        }
        var timeline = $('detail-timeline');
        timeline.innerHTML = '';
        (data.events || []).forEach(function (ev) {
          var li = document.createElement('li');
          var strong = document.createElement('strong');
          strong.textContent = eventLabel(ev.action);
          li.appendChild(strong);
          li.appendChild(document.createTextNode(' — ' + formatDate(ev.created_at)));
          if (ev.note) {
            var note = document.createElement('span');
            note.textContent = ' — ' + ev.note;
            li.appendChild(note);
          }
          timeline.appendChild(li);
        });
        if (!data.events || data.events.length === 0) {
          var empty = document.createElement('li');
          empty.textContent = '—';
          timeline.appendChild(empty);
        }
        $('detail-note').value = app.admin_note || '';
        renderActions(app.status);
        loadDetailAccount(app);
        show($('admin-detail'), true);
        $('admin-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('detail-error');
        err.textContent = t('admin_load_error', 'Impossible de charger les demandes.');
        show(err, true);
      });
  }

  function loadDetailAccount(app) {
    var box = $('detail-account');
    show(box, false);
    if (app.status !== 'active') return;
    fetch('/api/admin-account?application_id=' + app.id, { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        $('detail-account-number').textContent = data.account.account_number;
        $('detail-account-balance').textContent = formatMoney(data.account.balance, data.account.currency);
        $('detail-view-account').onclick = function () {
          switchView('accounts');
          openAcctDetail(data.account.id);
        };
        show(box, true);
      })
      .catch(function () { /* no account yet: leave the box hidden */ });
  }

  function renderActions(status) {
    var box = $('detail-actions');
    box.innerHTML = '';
    show($('deposit-fields'), status === 'deposit_requested');
    function button(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
      return b;
    }
    if (status === 'pending') {
      button(t('admin_approve', 'Approuver'), '', function () { review('approved'); });
      button(t('admin_reject', 'Refuser'), 'btn-outline', function () { review('rejected'); });
    }
    if (status === 'approved') {
      button(t('admin_request_deposit', 'Demander le dépôt'), '', function () { review('deposit_requested'); });
      button(t('admin_reopen', 'Rouvrir'), 'btn-outline', function () { review('reopened'); });
    }
    if (status === 'deposit_requested') {
      button(t('admin_confirm_deposit', 'Confirmer le dépôt'), '', function () { review('deposit_received'); });
    }
    if (status === 'rejected') {
      button(t('admin_reopen', 'Rouvrir'), 'btn-outline', function () { review('reopened'); });
    }
    var del = button(t('admin_delete', 'Supprimer'), 'btn-danger', function () { deleteApplication(del); });
    del.dataset.armed = '0';
  }

  function review(decision) {
    show($('detail-error'), false);
    show($('detail-ok'), false);
    var payload = { id: state.detailId, decision: decision, note: $('detail-note').value.trim() };
    if (decision === 'deposit_received') {
      var amount = parseFloat($('deposit-amount').value);
      var currency = ($('deposit-currency').value || 'USD').trim().toUpperCase();
      if (!Number.isFinite(amount) || amount <= 0) {
        var err = $('detail-error');
        err.textContent = t('admin_deposit_amount_required', 'Indiquez le montant du dépôt reçu.');
        show(err, true);
        return;
      }
      payload.amount = amount;
      payload.currency = currency || 'USD';
      var pinValue = ($('deposit-pin').value || '').trim();
      if (pinValue && !/^\d{4}$/.test(pinValue)) {
        var pinErr = $('detail-error');
        pinErr.textContent = t('admin_pin_invalid', 'Le code PIN doit contenir exactement 4 chiffres.');
        show(pinErr, true);
        return;
      }
      if (pinValue) payload.pin = pinValue;
    }
    fetch('/api/admin-review', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'review');
        var ok = $('detail-ok');
        var msg = t('admin_review_done', 'Décision enregistrée.');
        if (pair.data.email_sent === false &&
          ['approved', 'rejected', 'deposit_requested', 'deposit_received'].indexOf(decision) !== -1) {
          msg += ' ' + t('admin_email_skipped', "L'e-mail au client n'a pas été envoyé (l'e-mail n'est pas encore configuré).");
        }
        ok.textContent = msg;
        show(ok, true);
        loadList();
        openDetail(state.detailId);
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('detail-error');
        err.textContent =
          e.message === 'pin_required' ? t('admin_pin_required', "Définissez un code PIN à 4 chiffres pour créer le compte : la demande n'en a pas.") :
          e.message === 'invalid_pin' ? t('admin_pin_invalid', 'Le code PIN doit contenir exactement 4 chiffres.') :
          e.message === 'migration_required' ? t('admin_pin_migration', "Les colonnes du code PIN n'existent pas encore : exécutez sql/migrations/2026-11-06-client-pin-login.sql dans l'éditeur SQL Neon.") :
          t('admin_review_error', "La décision n'a pas pu être enregistrée.");
        show(err, true);
      });
  }

  function deleteApplication(button) {
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.textContent = t('admin_delete_confirm', 'Confirmer la suppression ?');
      setTimeout(function () {
        if (button.isConnected) {
          button.dataset.armed = '0';
          button.textContent = t('admin_delete', 'Supprimer');
        }
      }, 5000);
      return;
    }
    fetch('/api/admin-delete', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id: state.detailId })
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error('delete');
        var ok = $('detail-ok');
        ok.textContent = t('admin_deleted', 'Demande supprimée.');
        show(ok, true);
        show($('admin-detail'), false);
        state.detailId = null;
        loadList();
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('detail-error');
        err.textContent = t('admin_delete_error', 'La demande n\'a pas pu être supprimée.');
        show(err, true);
      });
  }

  function exportCsv() {
    var f = currentFilters();
    var params = new URLSearchParams();
    ['search', 'status', 'account_type', 'date_from', 'date_to'].forEach(function (k) {
      if (f[k]) params.set(k, f[k]);
    });
    fetch('/api/admin-export?' + params.toString(), { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        if (!r.ok) throw new Error('export');
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'applications.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('admin-load-error');
        err.textContent = t('admin_export_error', "L'export n'a pas pu être réalisé.");
        show(err, true);
      });
  }

  function switchView(view) {
    state.view = view;
    $('tab-applications').classList.toggle('active', view === 'applications');
    $('tab-accounts').classList.toggle('active', view === 'accounts');
    $('tab-transfers').classList.toggle('active', view === 'transfers');
    $('tab-deposits').classList.toggle('active', view === 'deposits');
    show($('view-applications'), view === 'applications');
    show($('view-accounts'), view === 'accounts');
    show($('view-transfers'), view === 'transfers');
    show($('view-deposits'), view === 'deposits');
    if (view === 'applications') loadList();
    else if (view === 'accounts') loadAccounts();
    else if (view === 'deposits') loadDeposits();
    else loadTransfers();
  }

  function depMethodLabel(method) {
    return {
      bank_transfer: t('client_deposit_method_bank', 'Virement bancaire'),
      cash: t('client_deposit_method_cash', 'Espèces en agence'),
      mobile_money: t('client_deposit_method_mobile', 'Mobile money'),
      other: t('client_deposit_method_other', 'Autre')
    }[method] || method;
  }

  function depCurrentFilters() {
    return {
      search: $('dep-search').value.trim(),
      status: $('dep-filter-status').value,
      sort: state.depSort,
      order: state.depOrder,
      page: state.depPage
    };
  }

  function loadDeposits() {
    var f = depCurrentFilters();
    var params = new URLSearchParams();
    Object.keys(f).forEach(function (k) { if (f[k] !== '' && f[k] !== null) params.set(k, f[k]); });
    show($('dep-loading'), true);
    show($('dep-load-error'), false);
    fetch('/api/admin-deposits?' + params.toString(), { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        show($('dep-loading'), false);
        if (!data.ok) throw new Error('load');
        if (data.migration_required) {
          var err = $('dep-load-error');
          err.textContent = t('admin_dep_migration', 'La table des demandes de dépôt n\'existe pas encore : exécutez sql/migrations/2026-11-06-deposit-requests.sql dans l\'éditeur SQL Neon.');
          show(err, true);
        }
        var stats = data.stats || {};
        $('dep-stat-total').textContent = stats.total != null ? stats.total : '—';
        $('dep-stat-pending').textContent = stats.pending != null ? stats.pending : '—';
        $('dep-stat-approved').textContent = stats.approved != null ? stats.approved : '—';
        $('dep-stat-rejected').textContent = stats.rejected != null ? stats.rejected : '—';
        var rows = data.deposits || [];
        var tbody = $('dep-rows');
        tbody.innerHTML = '';
        rows.forEach(function (dep) {
          var tr = document.createElement('tr');
          tr.className = 'clickable-row';
          tr.innerHTML =
            '<td data-label="' + escapeHtml(t('admin_col_ref', 'Référence')) + '">' + escapeHtml(dep.reference) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_dep_col_client', 'Client')) + '">' + escapeHtml(dep.last_name + ' ' + dep.first_name) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_acct_col_number', 'Numéro de compte')) + '">' + escapeHtml(dep.account_number) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_trf_col_amount', 'Montant')) + '">' + escapeHtml(formatMoney(dep.amount, dep.currency)) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_col_status', 'Statut')) + '"><span class="status-pill status-' + escapeHtml(dep.status) + '">' + escapeHtml(statusLabel(dep.status)) + '</span></td>' +
            '<td data-label="' + escapeHtml(t('admin_col_date', 'Date')) + '">' + escapeHtml(formatDate(dep.created_at)) + '</td>';
          tr.addEventListener('click', function () { openDepDetail(dep); });
          tbody.appendChild(tr);
        });
        show($('dep-table'), rows.length > 0);
        show($('dep-empty'), rows.length === 0);
        show($('dep-pager'), data.total_pages > 1);
        $('dep-page-label').textContent = data.page + ' ' + t('admin_page_of', 'sur') + ' ' + data.total_pages;
        $('dep-prev').disabled = data.page <= 1;
        $('dep-next').disabled = data.page >= data.total_pages;
        document.querySelectorAll('.dep-sort-btn').forEach(function (btn) {
          btn.dataset.dir = (btn.dataset.sort === state.depSort) ? state.depOrder : '';
        });
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        show($('dep-loading'), false);
        var errBox = $('dep-load-error');
        errBox.textContent = t('admin_acct_load_error', 'Impossible de charger les comptes.');
        show(errBox, true);
      });
  }

  function openDepDetail(dep) {
    state.depDetailId = dep.id;
    show($('dep-error'), false);
    show($('dep-ok'), false);
    $('dep-ref').textContent = dep.reference + ' — ' + dep.last_name + ' ' + dep.first_name;
    var fields = [
      [t('admin_dep_col_client', 'Client'), dep.last_name + ' ' + dep.first_name],
      [t('open_email', 'Adresse e-mail'), dep.email],
      [t('admin_acct_col_number', 'Numéro de compte'), dep.account_number],
      [t('admin_trf_col_amount', 'Montant'), formatMoney(dep.amount, dep.currency)],
      [t('admin_deposit_currency_label', 'Devise'), dep.currency],
      [t('client_deposit_method', 'Mode de dépôt'), depMethodLabel(dep.method)],
      [t('client_deposit_note', 'Note (facultatif)'), dep.note || '—'],
      [t('admin_col_status', 'Statut'), statusLabel(dep.status)],
      [t('admin_created', 'Envoyée le'), formatDate(dep.created_at)],
      [t('admin_reviewed', 'Dernière décision le'), formatDate(dep.reviewed_at)],
      [t('admin_note_label', 'Note interne'), dep.admin_note || '—']
    ];
    var dl = $('dep-fields');
    dl.innerHTML = '';
    fields.forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      var dd = document.createElement('dd');
      dd.textContent = pair[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    $('dep-note').value = dep.admin_note || '';
    renderDepActions(dep.status);
    show($('dep-detail'), true);
    $('dep-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderDepActions(status) {
    var box = $('dep-actions');
    box.innerHTML = '';
    function button(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
      return b;
    }
    if (status === 'pending') {
      button(t('admin_dep_approve', 'Approuver et créditer'), '', function () { reviewDeposit('approved'); });
      button(t('admin_reject', 'Refuser'), 'btn-outline', function () { reviewDeposit('rejected'); });
    }
  }

  function reviewDeposit(decision) {
    show($('dep-error'), false);
    show($('dep-ok'), false);
    fetch('/api/admin-deposit-review', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id: state.depDetailId, decision: decision, note: $('dep-note').value.trim() })
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'review');
        var ok = $('dep-ok');
        ok.textContent = t('admin_review_done', 'Décision enregistrée.');
        show(ok, true);
        loadDeposits();
        show($('dep-detail'), false);
        state.depDetailId = null;
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('dep-error');
        err.textContent =
          e.message === 'currency_mismatch' ? t('admin_dep_currency_mismatch', 'La devise de la demande ne correspond pas à celle du compte. Enregistrez le dépôt manuellement depuis l\'onglet Comptes clients.') :
          e.message === 'account_on_hold' ? t('admin_acct_tx_hold_error', 'Le compte est bloqué : aucun mouvement n\'est possible.') :
          t('admin_review_error', 'La décision n\'a pas pu être enregistrée.');
        show(err, true);
      });
  }

  function acctCurrentFilters() {
    return {
      search: $('acct-search').value.trim(),
      status: $('acct-filter-status').value,
      sort: state.acctSort,
      order: state.acctOrder,
      page: state.acctPage
    };
  }

  function loadAccounts() {
    var f = acctCurrentFilters();
    var params = new URLSearchParams();
    Object.keys(f).forEach(function (k) { if (f[k] !== '' && f[k] !== null) params.set(k, f[k]); });
    show($('acct-loading'), true);
    show($('acct-load-error'), false);
    fetch('/api/admin-accounts?' + params.toString(), { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        show($('acct-loading'), false);
        if (!data.ok) throw new Error('load');
        var stats = data.stats || {};
        $('acct-stat-total').textContent = stats.total != null ? stats.total : '—';
        $('acct-stat-hold').textContent = stats.on_hold != null ? stats.on_hold : '—';
        var balances = (stats.balances || []).map(function (b) {
          return formatMoney(b.total, b.currency);
        });
        $('acct-stat-balance').textContent = balances.length ? balances.join(' · ') : '—';
        var rows = data.accounts || [];
        var tbody = $('acct-rows');
        tbody.innerHTML = '';
        rows.forEach(function (acct) {
          var tr = document.createElement('tr');
          tr.className = 'clickable-row';
          tr.innerHTML =
            '<td data-label="' + escapeHtml(t('admin_acct_col_number', 'Numéro de compte')) + '">' + escapeHtml(acct.account_number) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_acct_col_client', 'Client')) + '">' + escapeHtml(acct.last_name + ' ' + acct.first_name) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_acct_col_balance', 'Solde')) + '">' + escapeHtml(formatMoney(acct.balance, acct.currency)) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_col_status', 'Statut')) + '"><span class="status-pill status-' + escapeHtml(acct.status) + '">' + escapeHtml(acctStatusLabel(acct.status)) + '</span></td>' +
            '<td data-label="' + escapeHtml(t('admin_col_date', 'Date')) + '">' + escapeHtml(formatDate(acct.created_at)) + '</td>';
          tr.addEventListener('click', function () { openAcctDetail(acct.id); });
          tbody.appendChild(tr);
        });
        show($('acct-table'), rows.length > 0);
        show($('acct-empty'), rows.length === 0);
        show($('acct-pager'), data.total_pages > 1);
        $('acct-page-label').textContent = data.page + ' ' + t('admin_page_of', 'sur') + ' ' + data.total_pages;
        $('acct-prev').disabled = data.page <= 1;
        $('acct-next').disabled = data.page >= data.total_pages;
        document.querySelectorAll('.acct-sort-btn').forEach(function (btn) {
          btn.dataset.dir = (btn.dataset.sort === state.acctSort) ? state.acctOrder : '';
        });
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        show($('acct-loading'), false);
        var err = $('acct-load-error');
        err.textContent = t('admin_acct_load_error', 'Impossible de charger les comptes.');
        show(err, true);
      });
  }

  function openAcctDetail(id) {
    state.acctDetailId = id;
    state.acctHoldArmed = false;
    show($('acct-error'), false);
    show($('acct-ok'), false);
    fetch('/api/admin-account?id=' + id, { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error('load');
        var acct = data.account;
        $('acct-ref').textContent = acct.account_number + ' — ' + acct.last_name + ' ' + acct.first_name;
        var fields = [
          [t('admin_acct_col_number', 'Numéro de compte'), acct.account_number],
          [t('admin_acct_col_client', 'Client'), acct.last_name + ' ' + acct.first_name],
          [t('open_email', 'Adresse e-mail'), acct.email],
          [t('con_phone_title', 'Téléphone'), acct.phone],
          [t('open_acct_type', 'Type de compte souhaité'), accountLabel(acct.account_type)],
          [t('admin_col_ref', 'Référence'), acct.reference],
          [t('admin_acct_col_balance', 'Solde'), formatMoney(acct.balance, acct.currency)],
          [t('admin_deposit_currency_label', 'Devise'), acct.currency],
          [t('admin_col_status', 'Statut'), acctStatusLabel(acct.status)],
          [t('admin_acct_created_label', 'Compte créé le'), formatDate(acct.created_at)]
        ];
        var dl = $('acct-fields');
        dl.innerHTML = '';
        fields.forEach(function (pair) {
          var dt = document.createElement('dt');
          dt.textContent = pair[0];
          var dd = document.createElement('dd');
          dd.textContent = pair[1];
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
        $('acct-view-application').onclick = function () {
          switchView('applications');
          openDetail(acct.application_id);
        };
        var txBody = $('acct-tx-rows');
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
        show($('acct-tx-table'), (data.transactions || []).length > 0);
        show($('acct-tx-empty'), (data.transactions || []).length === 0);
        $('tx-amount').value = '';
        $('tx-note').value = '';
        renderAcctActions(acct.status);
        show($('acct-detail'), true);
        $('acct-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('acct-error');
        err.textContent = t('admin_acct_load_error', 'Impossible de charger les comptes.');
        show(err, true);
      });
  }

  function renderAcctActions(status) {
    var box = $('acct-actions');
    box.innerHTML = '';
    function button(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
      return b;
    }
    if (status === 'active') {
      var hold = button(t('admin_acct_hold', 'Bloquer le compte'), 'btn-danger', function () { holdAccount('hold', hold); });
      hold.dataset.armed = '0';
    } else {
      var release = button(t('admin_acct_release', 'Débloquer le compte'), '', function () { holdAccount('release', release); });
      release.dataset.armed = '0';
    }
    var del = button(t('admin_acct_delete', 'Supprimer le compte'), 'btn-danger', function () { deleteAccount(del); });
    del.dataset.armed = '0';
  }

  function deleteAccount(button) {
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.textContent = t('admin_acct_delete_confirm', 'Confirmer la suppression du compte ?');
      setTimeout(function () {
        if (button.isConnected) {
          button.dataset.armed = '0';
          button.textContent = t('admin_acct_delete', 'Supprimer le compte');
        }
      }, 5000);
      return;
    }
    show($('acct-error'), false);
    show($('acct-ok'), false);
    fetch('/api/admin-account?id=' + state.acctDetailId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token() }
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'delete');
        var ok = $('acct-ok');
        ok.textContent = t('admin_acct_delete_done', 'Compte supprimé.');
        show(ok, true);
        show($('acct-detail'), false);
        state.acctDetailId = null;
        loadAccounts();
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('acct-error');
        err.textContent =
          e.message === 'nonzero_balance' ? t('admin_acct_delete_nonzero', 'Le solde doit être à zéro pour supprimer ce compte.') :
          e.message === 'account_on_hold' ? t('admin_acct_delete_hold', "Débloquez d'abord le compte pour pouvoir le supprimer.") :
          t('admin_acct_delete_error', 'Le compte n\'a pas pu être supprimé.');
        show(err, true);
      });
  }

  function createAccount() {
    var errEl = $('add-acct-error');
    var okEl = $('add-acct-ok');
    show(errEl, false);
    show(okEl, false);
    var reference = $('add-acct-ref').value.trim();
    if (!reference) {
      errEl.textContent = t('admin_acct_add_error', 'Le compte n\'a pas pu être créé.');
      show(errEl, true);
      return;
    }
    var balance = $('add-acct-balance').value.trim();
    var currency = ($('add-acct-currency').value || 'USD').trim().toUpperCase() || 'USD';
    var pinValue = ($('add-acct-pin').value || '').trim();
    if (pinValue && !/^\d{4}$/.test(pinValue)) {
      errEl.textContent = t('admin_pin_invalid', 'Le code PIN doit contenir exactement 4 chiffres.');
      show(errEl, true);
      return;
    }
    var payload = { reference: reference, opening_balance: balance, currency: currency };
    if (pinValue) payload.pin = pinValue;
    fetch('/api/admin-accounts', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'create');
        okEl.textContent = t('admin_acct_add_done', 'Compte créé.') +
          (pair.data.account ? ' ' + pair.data.account.account_number : '');
        show(okEl, true);
        $('add-acct-ref').value = '';
        $('add-acct-balance').value = '';
        $('add-acct-currency').value = 'USD';
        $('add-acct-pin').value = '';
        loadAccounts();
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        errEl.textContent =
          e.message === 'account_exists' ? t('admin_acct_add_exists', 'Cette demande a déjà un compte.') :
          e.message === 'not_eligible' ? t('admin_acct_add_not_eligible', "Cette demande doit d'abord être approuvée.") :
          e.message === 'pin_required' ? t('admin_pin_required', "Définissez un code PIN à 4 chiffres pour créer le compte : la demande n'en a pas.") :
          e.message === 'invalid_pin' ? t('admin_pin_invalid', 'Le code PIN doit contenir exactement 4 chiffres.') :
          e.message === 'migration_required' ? t('admin_pin_migration', "Les colonnes du code PIN n'existent pas encore : exécutez sql/migrations/2026-11-06-client-pin-login.sql dans l'éditeur SQL Neon.") :
          t('admin_acct_add_error', 'Le compte n\'a pas pu être créé.');
        show(errEl, true);
      });
  }

  function recordTransaction() {
    show($('acct-error'), false);
    show($('acct-ok'), false);
    var amount = parseFloat($('tx-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      var err = $('acct-error');
      err.textContent = t('admin_acct_tx_invalid', 'Indiquez un montant valide supérieur à zéro.');
      show(err, true);
      return;
    }
    fetch('/api/admin-transaction', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        account_id: state.acctDetailId,
        type: $('tx-type').value,
        amount: amount,
        note: $('tx-note').value.trim()
      })
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'transaction');
        var ok = $('acct-ok');
        ok.textContent = t('admin_acct_tx_done', 'Mouvement enregistré.');
        show(ok, true);
        loadAccounts();
        openAcctDetail(state.acctDetailId);
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('acct-error');
        err.textContent =
          e.message === 'insufficient_balance' ? t('admin_acct_tx_insufficient', 'Solde insuffisant pour ce retrait.') :
          e.message === 'account_on_hold' ? t('admin_acct_tx_hold_error', 'Le compte est bloqué : aucun mouvement n\'est possible.') :
          t('admin_acct_tx_error', 'Le mouvement n\'a pas pu être enregistré.');
        show(err, true);
      });
  }

  function holdAccount(action, button) {
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.textContent = action === 'hold'
        ? t('admin_acct_hold_confirm', 'Confirmer le blocage du compte ?')
        : t('admin_acct_release_confirm', 'Confirmer le déblocage du compte ?');
      setTimeout(function () {
        if (button.isConnected) {
          button.dataset.armed = '0';
          button.textContent = action === 'hold'
            ? t('admin_acct_hold', 'Bloquer le compte')
            : t('admin_acct_release', 'Débloquer le compte');
        }
      }, 5000);
      return;
    }
    show($('acct-error'), false);
    show($('acct-ok'), false);
    fetch('/api/admin-hold', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ account_id: state.acctDetailId, action: action, note: '' })
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error('hold');
        var ok = $('acct-ok');
        ok.textContent = action === 'hold'
          ? t('admin_acct_hold_done', 'Compte bloqué.')
          : t('admin_acct_release_done', 'Compte débloqué.');
        show(ok, true);
        loadAccounts();
        openAcctDetail(state.acctDetailId);
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('acct-error');
        err.textContent = t('admin_acct_hold_error', 'Le blocage n\'a pas pu être enregistré.');
        show(err, true);
      });
  }

  function trfRegionLabel(region) {
    return {
      africa: t('trf_region_africa', 'Afrique'),
      europe: t('trf_region_europe', 'Europe'),
      america: t('trf_region_america', 'Amérique'),
      asia: t('trf_region_asia', 'Asie')
    }[region] || region;
  }

  function trfCurrentFilters() {
    return {
      search: $('trf-search').value.trim(),
      status: $('trf-filter-status').value,
      region: $('trf-filter-region').value,
      sort: state.trfSort,
      order: state.trfOrder,
      page: state.trfPage
    };
  }

  function loadTransfers() {
    var f = trfCurrentFilters();
    var params = new URLSearchParams();
    Object.keys(f).forEach(function (k) { if (f[k] !== '' && f[k] !== null) params.set(k, f[k]); });
    show($('trf-loading'), true);
    show($('trf-load-error'), false);
    fetch('/api/admin-transfers?' + params.toString(), { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        show($('trf-loading'), false);
        if (!data.ok) throw new Error('load');
        var stats = data.stats || {};
        $('trf-stat-total').textContent = stats.total != null ? stats.total : '—';
        $('trf-stat-pending').textContent = stats.pending != null ? stats.pending : '—';
        $('trf-stat-approved').textContent = stats.approved != null ? stats.approved : '—';
        $('trf-stat-rejected').textContent = stats.rejected != null ? stats.rejected : '—';
        var rows = data.transfers || [];
        var tbody = $('trf-rows');
        tbody.innerHTML = '';
        rows.forEach(function (trf) {
          var tr = document.createElement('tr');
          tr.className = 'clickable-row';
          var bankLabel = trf.destination_bank + ' (' + trf.destination_country + ')';
          if (trf.is_manual_bank) bankLabel += ' — ' + t('admin_trf_manual', 'Banque saisie manuellement');
          if (trf.client_approved) bankLabel += ' · ' + t('admin_trf_client_approved', 'Approuvé par le client');
          tr.innerHTML =
            '<td data-label="' + escapeHtml(t('admin_col_ref', 'Référence')) + '">' + escapeHtml(trf.reference) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_trf_col_sender', 'Expéditeur')) + '">' + escapeHtml(trf.sender_name) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_trf_col_bank', 'Banque destinataire')) + '">' + escapeHtml(bankLabel) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_trf_col_amount', 'Montant')) + '">' + escapeHtml(formatMoney(trf.amount, trf.currency)) + '</td>' +
            '<td data-label="' + escapeHtml(t('admin_col_status', 'Statut')) + '"><span class="status-pill status-' + escapeHtml(trf.status) + '">' + escapeHtml(statusLabel(trf.status)) + '</span></td>' +
            '<td data-label="' + escapeHtml(t('admin_col_date', 'Date')) + '">' + escapeHtml(formatDate(trf.created_at)) + '</td>';
          tr.addEventListener('click', function () { openTrfDetail(trf); });
          tbody.appendChild(tr);
        });
        show($('trf-table'), rows.length > 0);
        show($('trf-empty'), rows.length === 0);
        show($('trf-pager'), data.total_pages > 1);
        $('trf-page-label').textContent = data.page + ' ' + t('admin_page_of', 'sur') + ' ' + data.total_pages;
        $('trf-prev').disabled = data.page <= 1;
        $('trf-next').disabled = data.page >= data.total_pages;
        document.querySelectorAll('.trf-sort-btn').forEach(function (btn) {
          btn.dataset.dir = (btn.dataset.sort === state.trfSort) ? state.trfOrder : '';
        });
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        show($('trf-loading'), false);
        var err = $('trf-load-error');
        err.textContent = t('admin_trf_load_error', 'Impossible de charger les virements.');
        show(err, true);
      });
  }

  function openTrfDetail(trf) {
    state.trfDetailId = trf.id;
    show($('trf-error'), false);
    show($('trf-ok'), false);
    $('trf-ref').textContent = trf.reference + ' — ' + trf.sender_name;
    var bankDetail = trf.destination_bank + ' (' + trf.destination_country + ')';
    if (trf.is_manual_bank) bankDetail += ' — ' + t('admin_trf_manual', 'Banque saisie manuellement');
    var clientApproval = trf.client_approved
      ? t('admin_trf_client_approved', 'Approuvé par le client')
      : t('admin_trf_client_pending', "En attente de l'approbation du client");
    var fields = [
      [t('admin_trf_col_sender', 'Expéditeur'), trf.sender_name],
      [t('trf_sender_email', 'Votre adresse e-mail'), trf.sender_email],
      [t('trf_sender_phone', 'Votre téléphone (facultatif)'), trf.sender_phone || '—'],
      [t('trf_account_number', 'Votre numéro de compte'), trf.account_number],
      [t('admin_trf_col_bank', 'Banque destinataire'), bankDetail],
      [t('admin_trf_region_label', 'Région'), trfRegionLabel(trf.destination_region)],
      [t('admin_trf_client_label', 'Approbation du client'), clientApproval],
      [t('trf_recipient_name', 'Nom du bénéficiaire'), trf.recipient_name],
      [t('trf_recipient_account', 'Numéro de compte du bénéficiaire'), trf.recipient_account],
      [t('admin_trf_col_amount', 'Montant'), formatMoney(trf.amount, trf.currency)],
      [t('trf_currency', 'Devise'), trf.currency],
      [t('trf_purpose', 'Motif (facultatif)'), trf.purpose || '—'],
      [t('admin_col_status', 'Statut'), statusLabel(trf.status)],
      [t('admin_created', 'Envoyée le'), formatDate(trf.created_at)],
      [t('admin_reviewed', 'Dernière décision le'), formatDate(trf.reviewed_at)],
      [t('admin_note_label', 'Note interne'), trf.admin_note || '—']
    ];
    var dl = $('trf-fields');
    dl.innerHTML = '';
    fields.forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      var dd = document.createElement('dd');
      dd.textContent = pair[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    $('trf-note').value = trf.admin_note || '';
    renderTrfActions(trf.status);
    show($('trf-detail'), true);
    $('trf-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTrfActions(status) {
    var box = $('trf-actions');
    box.innerHTML = '';
    function button(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
      return b;
    }
    if (status === 'pending') {
      button(t('admin_trf_approve', 'Approuver'), '', function () { reviewTransfer('approved'); });
      button(t('admin_trf_reject', 'Refuser'), 'btn-outline', function () { reviewTransfer('rejected'); });
    }
  }

  function reviewTransfer(decision) {
    show($('trf-error'), false);
    show($('trf-ok'), false);
    fetch('/api/admin-transfer-review', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id: state.trfDetailId, decision: decision, note: $('trf-note').value.trim() })
    })
      .then(function (r) {
        if (r.status === 401) { authFailed(); throw new Error('auth'); }
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (pair) {
        if (!pair.data.ok) throw new Error(pair.data.error || 'review');
        var ok = $('trf-ok');
        var msg = t('admin_trf_review_done', 'Décision enregistrée.');
        if (pair.data.email_sent === false) {
          msg += ' ' + t('admin_email_skipped', "L'e-mail au client n'a pas été envoyé (l'e-mail n'est pas encore configuré).");
        }
        ok.textContent = msg;
        show(ok, true);
        loadTransfers();
        show($('trf-detail'), false);
        state.trfDetailId = null;
      })
      .catch(function (e) {
        if (e.message === 'auth') return;
        var err = $('trf-error');
        err.textContent = t('admin_trf_review_error', "La décision n'a pas pu être enregistrée.");
        show(err, true);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('admin-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('admin-login-error');
      show(err, false);
      fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('admin-password').value })
      })
        .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
        .then(function (pair) {
          if (!pair.data.ok || !pair.data.token) throw new Error('login');
          setToken(pair.data.token);
          $('admin-password').value = '';
          show($('admin-login'), false);
          show($('admin-panel'), true);
          switchView('applications');
        })
        .catch(function () {
          err.textContent = t('admin_login_error', 'Mot de passe incorrect.');
          show(err, true);
        });
    });

    $('admin-logout').addEventListener('click', function () {
      setToken(null);
      show($('admin-panel'), false);
      show($('admin-login'), true);
    });

    var searchTimer = null;
    $('admin-search').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { state.page = 1; loadList(); }, 400);
    });
    ['admin-filter-status', 'admin-filter-account', 'admin-date-from', 'admin-date-to'].forEach(function (id) {
      $(id).addEventListener('change', function () { state.page = 1; loadList(); });
    });
    document.querySelectorAll('.sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.sort;
        if (state.sort === key) state.order = state.order === 'asc' ? 'desc' : 'asc';
        else { state.sort = key; state.order = 'asc'; }
        loadList();
      });
    });
    $('admin-prev').addEventListener('click', function () {
      if (state.page > 1) { state.page -= 1; loadList(); }
    });
    $('admin-next').addEventListener('click', function () { state.page += 1; loadList(); });
    $('admin-export').addEventListener('click', exportCsv);
    $('admin-back').addEventListener('click', function () {
      show($('admin-detail'), false);
      state.detailId = null;
    });
    $('tab-applications').addEventListener('click', function () { switchView('applications'); });
    $('tab-accounts').addEventListener('click', function () { switchView('accounts'); });
    $('tab-transfers').addEventListener('click', function () { switchView('transfers'); });
    $('tab-deposits').addEventListener('click', function () { switchView('deposits'); });
    var acctSearchTimer = null;
    $('acct-search').addEventListener('input', function () {
      clearTimeout(acctSearchTimer);
      acctSearchTimer = setTimeout(function () { state.acctPage = 1; loadAccounts(); }, 400);
    });
    $('acct-filter-status').addEventListener('change', function () { state.acctPage = 1; loadAccounts(); });
    document.querySelectorAll('.acct-sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.sort;
        if (state.acctSort === key) state.acctOrder = state.acctOrder === 'asc' ? 'desc' : 'asc';
        else { state.acctSort = key; state.acctOrder = 'asc'; }
        loadAccounts();
      });
    });
    $('acct-prev').addEventListener('click', function () {
      if (state.acctPage > 1) { state.acctPage -= 1; loadAccounts(); }
    });
    $('acct-next').addEventListener('click', function () { state.acctPage += 1; loadAccounts(); });
    $('acct-back').addEventListener('click', function () {
      show($('acct-detail'), false);
      state.acctDetailId = null;
    });
    $('tx-submit').addEventListener('click', recordTransaction);
    $('add-acct-submit').addEventListener('click', createAccount);
    var trfSearchTimer = null;
    $('trf-search').addEventListener('input', function () {
      clearTimeout(trfSearchTimer);
      trfSearchTimer = setTimeout(function () { state.trfPage = 1; loadTransfers(); }, 400);
    });
    ['trf-filter-status', 'trf-filter-region'].forEach(function (id) {
      $(id).addEventListener('change', function () { state.trfPage = 1; loadTransfers(); });
    });
    document.querySelectorAll('.trf-sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.sort;
        if (state.trfSort === key) state.trfOrder = state.trfOrder === 'asc' ? 'desc' : 'asc';
        else { state.trfSort = key; state.trfOrder = 'asc'; }
        loadTransfers();
      });
    });
    $('trf-prev').addEventListener('click', function () {
      if (state.trfPage > 1) { state.trfPage -= 1; loadTransfers(); }
    });
    $('trf-next').addEventListener('click', function () { state.trfPage += 1; loadTransfers(); });
    $('trf-back').addEventListener('click', function () {
      show($('trf-detail'), false);
      state.trfDetailId = null;
    });
    $('dep-back').addEventListener('click', function () {
      show($('dep-detail'), false);
      state.depDetailId = null;
    });
    var depSearchTimer = null;
    $('dep-search').addEventListener('input', function () {
      clearTimeout(depSearchTimer);
      depSearchTimer = setTimeout(function () { state.depPage = 1; loadDeposits(); }, 400);
    });
    $('dep-filter-status').addEventListener('change', function () { state.depPage = 1; loadDeposits(); });
    document.querySelectorAll('.dep-sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.sort;
        if (state.depSort === key) state.depOrder = state.depOrder === 'asc' ? 'desc' : 'asc';
        else { state.depSort = key; state.depOrder = 'asc'; }
        loadDeposits();
      });
    });
    $('dep-prev').addEventListener('click', function () {
      if (state.depPage > 1) { state.depPage -= 1; loadDeposits(); }
    });
    $('dep-next').addEventListener('click', function () { state.depPage += 1; loadDeposits(); });
    document.addEventListener('icb-lang', function () {
      if (token() && !$('admin-panel').hidden) {
        if (state.view === 'accounts') loadAccounts();
        else if (state.view === 'transfers') loadTransfers();
        else if (state.view === 'deposits') loadDeposits();
        else loadList();
      }
    });
  });
})();
