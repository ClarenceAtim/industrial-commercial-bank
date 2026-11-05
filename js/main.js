/* Industrial Commercial Bank — shared UI behaviour (Phase 1, frontend only) */
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
  document.querySelectorAll('form[data-local-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var target = document.getElementById(form.getAttribute('data-local-confirm'));
      if (target) {
        var ref = document.querySelector('[data-demo-ref]', target);
        if (ref) ref.textContent = 'ICB-DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        target.classList.add('show');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  // ID upload field: show chosen file name only (no upload in Phase 1)
  var idInput = document.getElementById('id-photo');
  var idName = document.getElementById('id-photo-name');
  if (idInput && idName) {
    idInput.addEventListener('change', function () {
      idName.textContent = idInput.files.length
        ? 'Selected: ' + idInput.files[0].name + ' (not uploaded — secure upload arrives in Phase 2)'
        : '';
    });
  }
});
