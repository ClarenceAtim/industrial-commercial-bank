/* Industrial Commercial Bank — account application form: real submission */
(function () {
  var MAX_PHOTO_BYTES = 5 * 1024 * 1024;

  function t(key, fallback) {
    var d = window.__icbDict || {};
    return d[key] !== undefined ? d[key] : fallback;
  }
  function $(id) { return document.getElementById(id); }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        resolve(dataUrl.indexOf(',') !== -1 ? dataUrl.split(',')[1] : '');
      };
      reader.onerror = function () { reject(new Error('read')); };
      reader.readAsDataURL(file);
    });
  }

  function ageFromDob(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    var parts = value.split('-').map(Number);
    var now = new Date();
    var age = now.getFullYear() - parts[0];
    var m = (now.getMonth() + 1) - parts[1];
    if (m < 0 || (m === 0 && now.getDate() < parts[2])) age--;
    return age;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = $('open-account-form');
    if (!form) return;
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.textContent : '';

    /* Applicants under 17 need a parent or guardian's approval: show
       the parental section as soon as the birth date says so. */
    var dobInput = form.querySelector('input[name="dob"]');
    var parentalBox = $('parental-fieldset');
    function updateParental() {
      if (!dobInput || !parentalBox) return;
      var age = ageFromDob(dobInput.value);
      parentalBox.hidden = !(age !== null && age < 17);
    }
    if (dobInput) dobInput.addEventListener('change', updateParental);
    updateParental();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var result = $('open-result');
      var errorBox = $('open-error');
      var errorText = $('open-error-text');
      result.classList.remove('show');
      errorBox.classList.remove('show');

      var data = new FormData(form);
      var photo = data.get('id_photo');
      if (photo && photo.size && photo.size > MAX_PHOTO_BYTES) {
        errorText.textContent = t('open_error_file_size', 'La photo de la pièce est trop lourde (maximum 5 Mo).');
        errorBox.classList.add('show');
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      var payload = {};
      ['first_name', 'last_name', 'dob', 'nationality', 'phone', 'email', 'address',
        'country', 'id_type', 'id_number', 'account_type'].forEach(function (key) {
        payload[key] = String(data.get(key) || '').trim();
      });

      /* Under 17, the application is rejected without a parent or
         guardian's approval: name + ticked approval box, both required. */
      var age = ageFromDob(payload.dob);
      if (age !== null && age < 17) {
        var parentName = String(data.get('parent_guardian_name') || '').trim();
        var parentConsent = data.get('parental_consent') === 'yes';
        if (!parentName || !parentConsent) {
          errorText.textContent = t('open_underage_error', 'Les demandeurs de moins de 17 ans ont besoin de l\'approbation d\'un parent ou tuteur : indiquez le nom du parent ou tuteur et cochez la case d\'approbation.');
          errorBox.classList.add('show');
          errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        payload.parent_guardian_name = parentName;
        payload.parental_consent = true;
      }

      var pin = String(data.get('pin') || '').trim();
      var pinConfirm = String(data.get('pin_confirm') || '').trim();
      if (!/^\d{4}$/.test(pin) || pin !== pinConfirm) {
        errorText.textContent = t('open_pin_error', 'Le code PIN doit contenir exactement 4 chiffres et les deux saisies doivent être identiques.');
        errorBox.classList.add('show');
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      payload.pin = pin;
      payload.pin_confirm = pinConfirm;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t('open_sending', 'Envoi en cours…');
      }

      function send() {
        return fetch('/api/submit-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (r) {
            return r.json().then(function (body) { return { status: r.status, body: body }; });
          })
          .then(function (pair) {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = submitLabel;
            }
            if (pair.body && pair.body.ok && pair.body.reference) {
              var ref = document.querySelector('[data-real-ref]');
              if (ref) ref.textContent = pair.body.reference;
              result.classList.add('show');
              result.scrollIntoView({ behavior: 'smooth', block: 'center' });
              form.reset();
              var name = $('id-photo-name');
              if (name) name.textContent = '';
            } else {
              var message = t('open_error_text', 'Veuillez vérifier votre connexion et réessayer. Si le problème persiste, contactez la banque.');
              if (pair.body && pair.body.error === 'photo_too_large') {
                message = t('open_error_file_size', 'La photo de la pièce est trop lourde (maximum 5 Mo).');
              } else if (pair.body && pair.body.error === 'invalid_pin') {
                message = t('open_pin_error', 'Le code PIN doit contenir exactement 4 chiffres et les deux saisies doivent être identiques.');
              } else if (pair.body && pair.body.error === 'underage_parental_approval') {
                message = t('open_underage_error', 'Les demandeurs de moins de 17 ans ont besoin de l\'approbation d\'un parent ou tuteur : indiquez le nom du parent ou tuteur et cochez la case d\'approbation.');
              } else if (pair.body && pair.body.error === 'invalid_fields') {
                message = t('open_error_text', 'Veuillez vérifier votre connexion et réessayer. Si le problème persiste, contactez la banque.');
              }
              errorText.textContent = message;
              errorBox.classList.add('show');
              errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          })
          .catch(function () {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = submitLabel;
            }
            errorText.textContent = t('open_error_text', 'Veuillez vérifier votre connexion et réessayer. Si le problème persiste, contactez la banque.');
            errorBox.classList.add('show');
            errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
      }

      if (photo && photo.size) {
        readFileAsBase64(photo)
          .then(function (base64) {
            payload.id_photo_base64 = base64;
            payload.id_photo_filename = photo.name;
            payload.id_photo_mimetype = photo.type;
            return send();
          })
          .catch(function () {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = submitLabel;
            }
            errorText.textContent = t('open_error_text', 'Veuillez vérifier votre connexion et réessayer. Si le problème persiste, contactez la banque.');
            errorBox.classList.add('show');
            errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
      } else {
        send();
      }
    });
  });
})();
