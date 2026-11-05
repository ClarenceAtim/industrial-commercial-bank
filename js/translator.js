/* Industrial Commercial Bank — dictionary-based i18n (FR primary + EN/ES/PT/AR/DE/ZH/TH/VI/JA/KO) */
(function () {
  var LANGS = ['fr', 'en', 'es', 'pt', 'ar', 'de', 'zh', 'th', 'vi', 'ja', 'ko'];
  var cache = {};
  function syncControls(lang) {
    document.documentElement.lang = lang;
    /* Arabic is the only RTL language; all others are LTR */
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    document.querySelectorAll('.lang-select').forEach(function (s) { s.value = lang; });
    document.querySelectorAll('.lang-switch button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
  }
  function apply(lang, dict) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-alt');
      if (dict[key] !== undefined) el.setAttribute('alt', dict[key]);
    });
    syncControls(lang);
    try { localStorage.setItem('icb-lang', lang); } catch (e) {}
    window.__icbDict = dict;
    window.__icbLang = lang;
    document.dispatchEvent(new CustomEvent('icb-lang', { detail: lang }));
  }
  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) lang = 'fr';
    if (cache[lang]) { apply(lang, cache[lang]); return; }
    fetch('languages/' + lang + '.json').then(function (r) { return r.json(); })
      .then(function (dict) { cache[lang] = dict; apply(lang, dict); })
      .catch(function () { syncControls(lang); /* keep default French text on failure */ });
  }
  document.addEventListener('DOMContentLoaded', function () {
    var saved = null;
    try { saved = localStorage.getItem('icb-lang'); } catch (e) {}
    if (saved && LANGS.indexOf(saved) !== -1 && saved !== 'fr') setLang(saved);
    else syncControls('fr');
    document.querySelectorAll('.lang-switch button').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });
    document.querySelectorAll('.lang-select').forEach(function (s) {
      s.addEventListener('change', function () { setLang(s.value); });
    });
  });
})();
