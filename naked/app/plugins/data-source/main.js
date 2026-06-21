'use strict';

/**
 * DataSourcePlugin – UI-facing plugin for switching TikTok data sources.
 *
 * Exposes REST routes and Socket.IO events so that the admin UI can:
 *   - query which adapter is currently active
 *   - switch between 'eulerstream' and 'tikfinity'
 *   - read / write TikFinity-specific settings (port)
 *
 * The actual adapter swap happens inside the TikTokConnector facade
 * on the next connect() call.  This plugin only manages the DB setting
 * and broadcasts the change to all connected dashboards.
 */
class DataSourcePlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
  }

  /**
   * Initialise routes and socket events.
   */
  async init() {
    // ── REST routes ──────────────────────────────────────────────

    this.api.registerRoute('get', '/api/data-source/status', (req, res) => {
      try {
        const currentSource = this.db.getSetting('tiktok_data_source') || 'eulerstream';
        const tikfinityPort = this._getTikFinityPort();

        res.json({
          success: true,
          currentSource,
          available: ['eulerstream', 'tikfinity'],
          settings: {
            tikfinity_ws_port: tikfinityPort
          }
        });
      } catch (error) {
        this.api.log(`[DataSource] GET /status error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/data-source/switch', (req, res) => {
      try {
        const { source } = req.body || {};

        if (!source || !['eulerstream', 'tikfinity'].includes(source)) {
          return res.status(400).json({
            success: false,
            error: 'Ungültige Quelle. Erlaubt: eulerstream, tikfinity'
          });
        }

        const previousSource = this.db.getSetting('tiktok_data_source') || 'eulerstream';
        this.db.setSetting('tiktok_data_source', source);

        this.api.log(`[DataSource] Switched: ${previousSource} → ${source}`, 'info');

        // Notify all dashboards
        this.io.emit('datasource:changed', {
          previousSource,
          newSource: source,
          timestamp: new Date().toISOString()
        });

        res.json({
          success: true,
          previousSource,
          newSource: source,
          message: source === previousSource
            ? `Datenquelle bleibt ${source}.`
            : `Datenquelle gewechselt: ${previousSource} → ${source}. Wird beim nächsten Verbinden aktiv.`
        });
      } catch (error) {
        this.api.log(`[DataSource] POST /switch error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/data-source/settings', (req, res) => {
      try {
        const { tikfinity_ws_port } = req.body || {};

        if (tikfinity_ws_port !== undefined) {
          const port = parseInt(tikfinity_ws_port, 10);
          if (isNaN(port) || port < 1 || port > 65535) {
            return res.status(400).json({
              success: false,
              error: 'Ungültiger Port. Erlaubt: 1 – 65535'
            });
          }
          this.db.setSetting('tikfinity_ws_port', String(port));
          this.api.log(`[DataSource] TikFinity port set to ${port}`, 'info');
        }

        res.json({
          success: true,
          settings: {
            tikfinity_ws_port: this._getTikFinityPort()
          }
        });
      } catch (error) {
        this.api.log(`[DataSource] POST /settings error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ── Socket.IO events ─────────────────────────────────────────

    this.api.registerSocket('datasource:get-status', (socket) => {
      try {
        const currentSource = this.db.getSetting('tiktok_data_source') || 'eulerstream';
        const tikfinityPort = this._getTikFinityPort();

        socket.emit('datasource:status', {
          currentSource,
          available: ['eulerstream', 'tikfinity'],
          settings: {
            tikfinity_ws_port: tikfinityPort
          }
        });
      } catch (error) {
        this.api.log(`[DataSource] Socket get-status error: ${error.message}`, 'error');
      }
    });

    this.api.registerSocket('datasource:switch', (socket, data) => {
      try {
        const source = data && data.source;

        if (!source || !['eulerstream', 'tikfinity'].includes(source)) {
          socket.emit('datasource:error', {
            error: 'Ungültige Quelle. Erlaubt: eulerstream, tikfinity'
          });
          return;
        }

        const previousSource = this.db.getSetting('tiktok_data_source') || 'eulerstream';
        this.db.setSetting('tiktok_data_source', source);

        this.api.log(`[DataSource] Socket switch: ${previousSource} → ${source}`, 'info');

        this.io.emit('datasource:changed', {
          previousSource,
          newSource: source,
          timestamp: new Date().toISOString()
        });

        socket.emit('datasource:switched', {
          success: true,
          previousSource,
          newSource: source,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.api.log(`[DataSource] Socket switch error: ${error.message}`, 'error');
        socket.emit('datasource:error', { error: error.message });
      }
    });

    this.api.registerSocket('datasource:save-settings', (socket, data) => {
      try {
        if (data && data.tikfinity_ws_port !== undefined) {
          const port = parseInt(data.tikfinity_ws_port, 10);
          if (isNaN(port) || port < 1 || port > 65535) {
            socket.emit('datasource:error', {
              error: 'Ungültiger Port. Erlaubt: 1 – 65535'
            });
            return;
          }
          this.db.setSetting('tikfinity_ws_port', String(port));
          this.api.log(`[DataSource] TikFinity port set to ${port} (socket)`, 'info');
        }

        socket.emit('datasource:settings-saved', {
          success: true,
          settings: {
            tikfinity_ws_port: this._getTikFinityPort()
          }
        });
      } catch (error) {
        this.api.log(`[DataSource] Socket save-settings error: ${error.message}`, 'error');
        socket.emit('datasource:error', { error: error.message });
      }
    });

    this.api.log('[DataSource] Plugin initialized', 'info');
  }

  /**
   * Returns the configured TikFinity WS port or the default (21213).
   * @returns {number}
   * @private
   */
  _getTikFinityPort() {
    const raw = this.db.getSetting('tikfinity_ws_port');
    const port = parseInt(raw, 10);
    if (!isNaN(port) && port >= 1 && port <= 65535) {
      return port;
    }
    return 21213;
  }

  /**
   * Cleanup on plugin unload.
   */
  async destroy() {
    this.api.log('[DataSource] Plugin destroyed', 'info');
  }
}

module.exports = DataSourcePlugin;
