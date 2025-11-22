// Lightweight i18n implementation for Epicare v4
// Usage: mark elements with data-i18n-key="label.patientName" etc.
// Call loadLanguage(langCode) to switch language

(function() {
  let translations = {};
  let currentLang = 'en';

  function translate(key) {
    return (translations && translations[key]) || key;
  }

  function updateDomTranslations() {
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
      const key = el.getAttribute('data-i18n-key');
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.hasAttribute('placeholder')) {
          el.setAttribute('placeholder', translate(key));
        } else {
          el.value = translate(key);
        }
      } else if (el.hasAttribute('data-i18n-attr')) {
        // e.g. data-i18n-attr="title"
        el.setAttribute(el.getAttribute('data-i18n-attr'), translate(key));
      } else {
        el.textContent = translate(key);
      }
    });
  }

  function loadLanguage(langCode) {
    return fetch('i18n/' + langCode + '.json')
      .then(resp => resp.json())
      .then(data => {
        translations = data;
        currentLang = langCode;
        localStorage.setItem('epicare_lang', langCode);
        updateDomTranslations();
      });
  }

  function getCurrentLang() {
    return currentLang;
  }

  // Expose globally
  window.EpicareI18n = {
    translate,
    loadLanguage,
    getCurrentLang,
    updateDomTranslations
  };

  // Auto-load preferred language on page load
  document.addEventListener('DOMContentLoaded', function() {
    const savedLang = localStorage.getItem('epicare_lang') || 'en';
    loadLanguage(savedLang);
  });
})();
