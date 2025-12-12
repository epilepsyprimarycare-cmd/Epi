// Lightweight i18n implementation for Epicare v4
// Usage: mark elements with data-i18n-key="label.patientName" etc.
// Call loadLanguage(langCode) to switch language
// Supports placeholders: EpicareI18n.translate('greeting', {name: 'John'}) -> "Hello John"

(function() {
  let translations = {};
  let fallbackTranslations = {}; // English as fallback
  let currentLang = 'en';

  function interpolate(text, params) {
    if (!params || typeof params !== 'object') return text;
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  function translate(key, params) {
    let text = translations[key] || fallbackTranslations[key] || key;
    return interpolate(text, params);
  }

  function updateDomTranslations() {
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
      const key = el.getAttribute('data-i18n-key');
      const params = el.getAttribute('data-i18n-params');
      let translated = translate(key);
      if (params) {
        try {
          const parsedParams = JSON.parse(params);
          translated = translate(key, parsedParams);
        } catch (e) {
          window.Logger.warn('Invalid i18n params for key:', key, params);
        }
      }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.hasAttribute('placeholder')) {
          el.setAttribute('placeholder', translated);
        } else {
          el.value = translated;
        }
      } else if (el.hasAttribute('data-i18n-attr')) {
        // e.g. data-i18n-attr="title"
        el.setAttribute(el.getAttribute('data-i18n-attr'), translated);
      } else {
        el.textContent = translated;
      }
    });
  }

  async function loadLanguage(langCode) {
    try {
      const response = await fetch('i18n/' + langCode + '.json');
      if (!response.ok) throw new Error('Failed to load language file');
      const data = await response.json();
      translations = data;
      currentLang = langCode;
      localStorage.setItem('epicare_lang', langCode);
      updateDomTranslations();
    } catch (error) {
      window.Logger.error('Error loading language:', langCode, error);
      // Fallback to English if loading fails
      if (langCode !== 'en') {
        await loadLanguage('en');
      }
    }
  }

  function getCurrentLang() {
    return currentLang;
  }

  // Load English as fallback on init
  async function initializeFallback() {
    try {
      const response = await fetch('i18n/en.json');
      if (response.ok) {
        fallbackTranslations = await response.json();
      }
    } catch (e) {
      window.Logger.warn('Could not load English fallback translations');
    }
  }

  // Expose globally
  window.EpicareI18n = {
    translate,
    loadLanguage,
    getCurrentLang,
    updateDomTranslations
  };

  // Auto-load preferred language on page load
  document.addEventListener('DOMContentLoaded', async function() {
    await initializeFallback();
    const savedLang = localStorage.getItem('epicare_lang') || 'en';
    await loadLanguage(savedLang);
  });
})();

