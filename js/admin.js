/* Industrial Commercial Bank — staff dashboard (admin.html) */
(function () {
  var TOKEN_KEY = 'icb-admin-token';
  var state = { page: 1, sort: 'created_at', order: 'desc', detailId: null, deleteArmed: false };

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

  function renderActions(status) {
    var box = $('detail-actions');
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
    fetch('/api/admin-review', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id: state.detailId, decision: decision, note: $('detail-note').value.trim() })
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
        err.textContent = e.message === 'invalid_transition'
          ? t('admin_review_error', "La décision n'a pas pu être enregistrée.")
          : t('admin_review_error', "La décision n'a pas pu être enregistrée.");
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
          loadList();
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
    document.addEventListener('icb-lang', function () {
      if (token() && !$('admin-panel').hidden) loadList();
    });
  });
})();
