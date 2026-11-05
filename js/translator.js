/* Industrial Commercial Bank — dictionary-based i18n (FR primary, EN second) */
(function () {
  var cache = {};
  function apply(lang, dict) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
    });
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang-switch button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
    try { localStorage.setItem('icb-lang', lang); } catch (e) {}
  }
  function setLang(lang) {
    if (cache[lang]) { apply(lang, cache[lang]); return; }
    fetch('languages/' + lang + '.json').then(function (r) { return r.json(); })
      .then(function (dict) { cache[lang] = dict; apply(lang, dict); })
      .catch(function () { /* keep default French text on failure */ });
  }
  document.addEventListener('DOMContentLoaded', function () {
    var saved = null;
    try { saved = localStorage.getItem('icb-lang'); } catch (e) {}
    if (saved && saved !== 'fr') setLang(saved);
    document.querySelectorAll('.lang-switch button').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });
  });
})();
