/* Industrial Commercial Bank — shared UI behaviour */
document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.parentElement.classList.toggle('open');
      var expanded = btn.parentElement.classList.contains('open');
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  });

  // Frontend-only forms: show a local confirmation state, send nothing anywhere.
  // (The account application form now submits to the backend; see js/open-account.js.)
  document.querySelectorAll('form[data-local-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var target = document.getElementById(form.getAttribute('data-local-confirm'));
      if (target) {
        target.classList.add('show');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  // ID upload field: show chosen file name
  var idInput = document.getElementById('id-photo');
  var idName = document.getElementById('id-photo-name');
  function renderIdNote() {
    if (!idInput || !idName) return;
    var d = window.__icbDict || {};
    var pre = d.open_file_prefix !== undefined ? d.open_file_prefix : 'Sélectionné : ';
    var suf = d.open_file_suffix !== undefined ? d.open_file_suffix : '';
    idName.textContent = idInput.files.length ? pre + idInput.files[0].name + suf : '';
  }
  if (idInput && idName) {
    idInput.addEventListener('change', renderIdNote);
    document.addEventListener('icb-lang', renderIdNote);
  }
});
