const ViewerProfilesPlugin = require('./analytics-plugin');

class NamespacedDatabaseAdapter {
  constructor(baseDatabase, namespaceTable = 'viewer_profiles_analytics') {
    this.rawDb = baseDatabase && baseDatabase.db ? baseDatabase.db : baseDatabase;
    this.namespaceTable = namespaceTable;

    if (!this.rawDb || typeof this.rawDb.prepare !== 'function') {
      throw new Error('Embedded Viewer Profiles requires a SQLite database with prepare() support');
    }
  }

  rewriteSql(sql) {
    return String(sql).replace(/\bviewer_profiles\b/g, this.namespaceTable);
  }

  prepare(sql) {
    return this.rawDb.prepare(this.rewriteSql(sql));
  }

  exec(sql) {
    const rewritten = this.rewriteSql(sql);

    if (typeof this.rawDb.exec === 'function') {
      return this.rawDb.exec(rewritten);
    }

    if (typeof this.rawDb.prepare === 'function') {
      const stmt = this.rawDb.prepare(rewritten);
      if (stmt && typeof stmt.run === 'function') {
        return stmt.run();
      }
      if (stmt && typeof stmt.exec === 'function') {
        return stmt.exec();
      }
    }

    return undefined;
  }

  transaction(fn) {
    if (typeof this.rawDb.transaction === 'function') {
      return this.rawDb.transaction(fn);
    }

    return (...args) => fn(...args);
  }

  pragma(...args) {
    if (typeof this.rawDb.pragma === 'function') {
      return this.rawDb.pragma(...args);
    }

    return [];
  }

  close() {
    if (typeof this.rawDb.close === 'function') {
      return this.rawDb.close();
    }

    return undefined;
  }
}

function createViewerProfilesIntegration(baseApi, options = {}) {
  const namespaceTable = options.namespaceTable || 'viewer_profiles_analytics';
  const baseDatabase = typeof baseApi.getDatabase === 'function' ? baseApi.getDatabase() : baseApi.db;
  const namespacedDb = new NamespacedDatabaseAdapter(baseDatabase, namespaceTable);

  const configApi = {
    pluginId: 'viewer-profiles',
    db: baseDatabase,
    configs: baseApi && baseApi.configs ? baseApi.configs : new Map(),
    log: typeof baseApi.log === 'function' ? baseApi.log.bind(baseApi) : console.log
  };

  const embeddedApi = Object.create(baseApi || null);
  embeddedApi.getDatabase = () => namespacedDb;

  if (typeof baseApi.getConfig === 'function') {
    embeddedApi.getConfig = (key = null) => baseApi.getConfig.call(configApi, key);
  } else {
    embeddedApi.getConfig = () => null;
  }

  if (typeof baseApi.setConfig === 'function') {
    embeddedApi.setConfig = (key, value) => baseApi.setConfig.call(configApi, key, value);
  } else {
    embeddedApi.setConfig = () => true;
  }

  if (typeof baseApi.log === 'function') {
    embeddedApi.log = (message, level = 'info') => baseApi.log(`[viewer-profiles] ${message}`, level);
  }

  const bindIfFunction = (name) => {
    if (typeof baseApi[name] === 'function') {
      embeddedApi[name] = baseApi[name].bind(baseApi);
    }
  };

  bindIfFunction('registerRoute');
  bindIfFunction('registerSocket');
  bindIfFunction('registerTikTokEvent');
  bindIfFunction('emit');
  bindIfFunction('on');
  bindIfFunction('removeListener');
  bindIfFunction('getSocketIO');
  bindIfFunction('getPluginInstance');
  bindIfFunction('getPlugin');

  return new ViewerProfilesPlugin(embeddedApi);
}

module.exports = {
  NamespacedDatabaseAdapter,
  createViewerProfilesIntegration
};
