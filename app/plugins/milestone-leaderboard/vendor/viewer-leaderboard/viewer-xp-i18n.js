(function initViewerXpI18n(global) {
  'use strict';

  const prefix = 'plugins.milestone-leaderboard.viewer_xp.runtime.';

  function interpolate(fallback, params) {
    return String(fallback).replace(/\{([A-Za-z_][\w.-]*)\}/g, (match, name) => (
      Object.hasOwn(params, name) ? params[name] : match
    ));
  }

  global.ViewerXpI18n = {
    text(key, fallback, params = {}) {
      const fullKey = `${prefix}${key}`;
      if (global.i18n && typeof global.i18n.t === 'function') {
        const translated = global.i18n.t(fullKey, params);
        if (translated && translated !== fullKey) return translated;
      }
      return interpolate(fallback, params);
    }
  };
}(window));
