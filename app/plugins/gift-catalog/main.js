
const path = require('path');

class GiftCatalogPlugin {
  constructor(api) {
    this.api = api;
    this.config = this.getDefaultConfig();
  }

  async init() {
    this.config = this.api.getConfig('config') || this.config;
    if (!this.config || typeof this.config !== 'object') {
      this.config = this.getDefaultConfig();
    }

    this.api.setConfig('config', this.normalizeConfig(this.config));
    this.config = this.normalizeConfig(this.api.getConfig('config'));

    this.registerRoutes();
    this.api.log('Gift Catalogue plugin initialized');
  }

  getDefaultConfig() {
    return {
      app_language: 'en-US',
      browser_language: 'en',
      webcast_language: 'en',
      priority_region: '',
      tz_name: 'Europe/Berlin',
      locales: this.getSupportedLocaleCodes()
    };
  }

  normalizeConfig(config = {}) {
    const defaults = this.getDefaultConfig();
    return {
      app_language: this.normalizeLocaleString(
        config.app_language,
        (this.config ? this.config.app_language : null) || defaults.app_language
      ),
      browser_language: this.normalizeLocaleString(
        config.browser_language,
        (this.config ? this.config.browser_language : null) || defaults.browser_language
      ),
      webcast_language: this.normalizeLocaleString(
        config.webcast_language,
        (this.config ? this.config.webcast_language : null) || defaults.webcast_language
      ),
      priority_region: this.normalizeRegionString(config.priority_region, defaults.priority_region),
      tz_name: this.normalizeLocaleString(config.tz_name, defaults.tz_name),
      locales: this.normalizeLocaleList(config.locales, defaults.locales)
    };
  }

  normalizeLocaleString(value, fallback) {
    if (typeof value !== 'string') {
      return fallback;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  normalizeRegionString(value, fallback) {
    if (typeof value !== 'string') {
      return fallback;
    }

    return value.trim();
  }

  normalizeLocaleCode(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim().toLowerCase();
  }

  normalizeLocaleList(values, fallback = []) {
    if (typeof values === 'string') {
      return this.normalizeLocaleList(values.split(','), fallback);
    }

    if (!Array.isArray(values)) {
      return Array.isArray(fallback) ? [...fallback] : [];
    }

    const normalized = [];
    const seen = new Set();

    for (const value of values) {
      const normalizedValue = this.normalizeLocaleCode(value);
      if (!normalizedValue || seen.has(normalizedValue)) {
        continue;
      }

      seen.add(normalizedValue);
      normalized.push(normalizedValue);
    }

    return normalized.length > 0 ? normalized : (Array.isArray(fallback) ? [...fallback] : []);
  }

  parseBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }

  parseLocaleListFromQuery(value, fallback = []) {
    if (value == null) {
      return [];
    }

    const rawValues = Array.isArray(value) ? value : [value];
    const localeSet = new Set();
    const result = [];

    rawValues.forEach((entry) => {
      if (typeof entry !== 'string') {
        return;
      }

      entry
        .split(',')
        .map((locale) => locale.trim())
        .filter(Boolean)
        .forEach((locale) => {
          const normalized = this.normalizeLocaleCode(locale);
          if (!normalized || localeSet.has(normalized)) {
            return;
          }

          localeSet.add(normalized);
          result.push(normalized);
        });
    });

    return result.length > 0 ? result : (Array.isArray(fallback) ? [...fallback] : []);
  }

  getSupportedLocaleMap() {
    return {
      en: {
        app_language: 'en-US',
        browser_language: 'en',
        webcast_language: 'en',
        priority_region: ''
      },
      de: {
        app_language: 'de-DE',
        browser_language: 'de',
        webcast_language: 'de',
        priority_region: 'DE'
      },
      es: {
        app_language: 'es-ES',
        browser_language: 'es',
        webcast_language: 'es',
        priority_region: 'ES'
      },
      fr: {
        app_language: 'fr-FR',
        browser_language: 'fr',
        webcast_language: 'fr',
        priority_region: 'FR'
      }
    };
  }

  getSupportedLocaleCodes() {
    return Object.keys(this.getSupportedLocaleMap());
  }

  getLocalePayload(locale) {
    const supportedMap = this.getSupportedLocaleMap();
    return supportedMap[this.normalizeLocaleCode(locale)] || null;
  }

  getLocalePayloadForRequest(rawLocale, fallback) {
    const localeCode = this.normalizeLocaleCode(rawLocale);
    if (!localeCode) return null;

    const directMatch = this.getLocalePayload(localeCode);
    if (directMatch) {
      return { ...directMatch, locale_code: localeCode };
    }

    const baseLocale = localeCode.split('-')[0];
    const baseMatch = this.getLocalePayload(baseLocale);
    if (baseMatch) {
      return { ...baseMatch, locale_code: localeCode };
    }

    if (!fallback) {
      return null;
    }

    return {
      app_language: fallback.app_language || 'en-US',
      browser_language: fallback.browser_language || 'en',
      webcast_language: fallback.webcast_language || fallback.browser_language || 'en',
      priority_region: fallback.priority_region || '',
      locale_code: localeCode
    };
  }

  buildRefreshPayloadForLocale(rawLocale, requestOptions) {
    const basePayload = requestOptions || this.getDefaultConfig();
    return this.getLocalePayloadForRequest(rawLocale, basePayload);
  }

  resolveRefreshLocales(locales) {
    if (!Array.isArray(locales) || locales.length === 0) {
      return this.getSupportedLocaleCodes();
    }

    const hasAll = locales.some((locale) => this.normalizeLocaleCode(locale) === 'all');
    if (hasAll) {
      return this.getSupportedLocaleCodes();
    }

    const localeSet = new Set();
    const result = [];

    for (const locale of locales) {
      const localeCode = this.normalizeLocaleCode(locale);
      if (!localeCode || localeSet.has(localeCode)) {
        continue;
      }

      localeSet.add(localeCode);
      result.push(localeCode);
    }

    return result;
  }

  normalizeRequestPayload(payload = {}) {
    const requestedLocales =
      Object.prototype.hasOwnProperty.call(payload, 'locales')
        ? payload.locales
        : null;

    const config = this.normalizeConfig({
      app_language: payload.app_language ?? payload.appLanguage,
      browser_language: payload.browser_language ?? payload.browserLanguage,
      webcast_language: payload.webcast_language ?? payload.webcastLanguage,
      priority_region: payload.priority_region ?? payload.region,
      tz_name: payload.tz_name ?? payload.timeZone ?? payload.timezone,
      locales: requestedLocales === null ? this.config.locales : requestedLocales
    });

    return {
      ...config,
      locales: requestedLocales === null ? config.locales : this.normalizeLocaleList(requestedLocales, config.locales)
    };
  }

  registerRoutes() {
    this.api.registerRoute('GET', '/gift-catalog/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    this.api.registerRoute('GET', '/api/gift-catalog-manager/config', (req, res) => {
      res.json({
        success: true,
        config: this.config
      });
    });

    this.api.registerRoute('GET', '/api/gift-catalog-manager/catalog', (req, res) => {
      if (!this.api.db || typeof this.api.db.getGiftCatalog !== 'function') {
        res.status(503).json({
          success: false,
          error: 'Database is not available for gift catalog access.'
        });
        return;
      }

      try {
        const query = req && req.query ? req.query : {};
        const supportedLocales = this.getSupportedLocaleCodes();
        const requestedLocalesFromQuery = this.parseLocaleListFromQuery(query.locales);
        const legacyLocale = this.normalizeLocaleCode(query.locale || query.language || query.lang);
        const includeAll = this.parseBoolean(query.all) || this.parseBoolean(query.all_locales) || this.parseBoolean(query.includeAll);
        const requestedRegion = this.normalizeRegionString(query.region || query.priority_region || query.priorityRegion, '');
        const normalizedLocaleRequest = requestedLocalesFromQuery
          .map((locale) => locale.toLowerCase())
          .filter(Boolean);
        const hasAllShortcut = normalizedLocaleRequest.includes('all') || legacyLocale === 'all';
        const locales = normalizedLocaleRequest.length > 0
          ? requestedLocalesFromQuery
          : (legacyLocale ? [legacyLocale] : []);

        const localeRequests = locales.filter((locale) => locale !== 'all');

        if (locales.length === 0 && includeAll) {
          localeRequests.push(...supportedLocales);
        }

        if (localeRequests.length === 0 && hasAllShortcut) {
          localeRequests.push(...supportedLocales);
        }

        if (!localeRequests.length) {
          const catalog = this.api.db.getGiftCatalog();
          const count = Array.isArray(catalog) ? catalog.length : 0;

          res.json({
            success: true,
            catalog,
            locale: null,
            locales: [],
            count,
            countByLocale: count,
            lastUpdate: this.api.db.getCatalogLastUpdate(),
            availableLocales: supportedLocales,
            region: requestedRegion || null
          });
          return;
        }

        const uniqueLocales = [];
        const seenLocales = new Set();

        for (const locale of localeRequests) {
          if (seenLocales.has(locale)) {
            continue;
          }

          seenLocales.add(locale);
          uniqueLocales.push(locale);
        }

        if (uniqueLocales.length === 1) {
          const locale = uniqueLocales[0];
          const catalog = this.api.db.getGiftCatalog(locale);
          const count = Array.isArray(catalog) ? catalog.length : 0;

          res.json({
            success: true,
            catalog,
            locale,
            locales: [locale],
            count,
            countByLocale: count,
            countsByLocale: { [locale]: count },
            lastUpdate: this.api.db.getCatalogLastUpdate(),
            availableLocales: supportedLocales,
            region: requestedRegion || null
          });
          return;
        }

        const catalogsByLocale = {};
        const countsByLocale = {};
        let totalCount = 0;

        uniqueLocales.forEach((locale) => {
          const localeCatalog = this.api.db.getGiftCatalog(locale);
          const normalizedCatalog = Array.isArray(localeCatalog) ? localeCatalog : [];
          catalogsByLocale[locale] = normalizedCatalog;
          countsByLocale[locale] = normalizedCatalog.length;
          totalCount += normalizedCatalog.length;
        });

        res.json({
          success: true,
          catalogsByLocale,
          locale: uniqueLocales[0] || null,
          locales: uniqueLocales,
          count: totalCount,
          countByLocale: totalCount,
          countsByLocale,
          lastUpdate: this.api.db.getCatalogLastUpdate(),
          availableLocales: supportedLocales,
          region: requestedRegion || null
        });
      } catch (error) {
        this.api.log(`Failed reading catalog from Gift Catalog Manager: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to load gift catalog'
        });
      }
    });

    this.api.registerRoute('POST', '/api/gift-catalog-manager/config', (req, res) => {
      const nextConfig = this.normalizeConfig({
        ...this.config,
        ...(req.body || {})
      });
      this.config = nextConfig;
      this.api.setConfig('config', this.config);

      res.json({
        success: true,
        config: this.config
      });
    });

    this.api.registerRoute('POST', '/api/gift-catalog-manager/refresh', async (req, res) => {
      if (!this.api.tiktok || typeof this.api.tiktok.updateGiftCatalog !== 'function') {
        res.status(503).json({ success: false, error: 'TikTok connector is not available.' });
        return;
      }

      try {
        const requestOptions = this.normalizeRequestPayload(req.body || {});
        const pluginConfig = this.config || this.getDefaultConfig();
        const localesToFetch = this.resolveRefreshLocales(requestOptions.locales || pluginConfig.locales || []);
        const localeRefreshPayloads = localesToFetch
          .map((locale) => this.buildRefreshPayloadForLocale(locale, requestOptions))
          .filter(Boolean)
          .map((payload) => ({
            ...payload,
            tz_name: requestOptions.tz_name || pluginConfig.tz_name
          }));

        if (!localeRefreshPayloads.length) {
          localeRefreshPayloads.push({
            app_language: requestOptions.app_language || pluginConfig.app_language,
            browser_language: requestOptions.browser_language || pluginConfig.browser_language,
            webcast_language: requestOptions.webcast_language || pluginConfig.webcast_language,
            priority_region: requestOptions.priority_region || pluginConfig.priority_region,
            tz_name: requestOptions.tz_name || pluginConfig.tz_name,
            locale_code: 'default'
          });
        }

        const results = [];
        let totalCount = 0;

        for (const payload of localeRefreshPayloads) {
          const result = await this.api.tiktok.updateGiftCatalog(payload);
          totalCount += result.count || 0;
          results.push(result);
        }

        const success = results.every(result => !!result.success);
        const finalCatalog = this.api.db ? this.api.db.getGiftCatalog() : [];

        res.json({
          success,
          usedConfig: requestOptions,
          locales: localeRefreshPayloads.map(payload => payload.locale_code),
          results,
          totalCount,
          catalog: finalCatalog
        });
      } catch (error) {
        this.api.log(`Gift catalog refresh failed: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message || 'Gift catalog refresh failed'
        });
      }
    });
  }
}

module.exports = GiftCatalogPlugin;
