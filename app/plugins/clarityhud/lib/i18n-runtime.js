(function attachClarityHudRuntimeI18n(global) {
  'use strict';

  const namespace = 'plugins.clarityhud.runtime.';

  function text(key, fallback, params = {}) {
    const fullKey = `${namespace}${key}`;
    const translator = global.i18n;
    if (!translator || !translator.initialized) return fallback;

    const translated = translator.t(fullKey, params);
    return translated === fullKey ? fallback : translated;
  }

  global.ClarityHUDI18n = { text };
}(window));
