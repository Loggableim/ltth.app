/**
 * OBS Websocket Integration Module
 *
 * Features:
 * - Connect to OBS via WebSocket
 * - Switch scenes based on events
 * - Toggle sources visibility
 * - Control filters
 * - Trigger actions on TikTok events
 */

const OBSWebSocket = require('obs-websocket-js').default;
const logger = require('./logger');

class OBSWebSocketManager {
  constructor(db, io = null) {
    this.db = db;
    this.io = io;
    this.obs = new OBSWebSocket();
    this.connected = false;
    this.config = this.loadConfig();
    this.eventMappings = this.loadEventMappings();
  }

  /**
   * Load OBS config from database
   */
  loadConfig() {
    const config = this.db.getSetting('obs_websocket_config');
    return config ? JSON.parse(config) : {
      enabled: false,
      host: 'localhost',
      port: 4455,
      password: ''
    };
  }

  /**
   * Load event → OBS action mappings
   */
  loadEventMappings() {
    const mappings = this.db.getSetting('obs_event_mappings');
    return mappings ? JSON.parse(mappings) : [];
  }

  /**
   * Save config to database
   */
  saveConfig(config) {
    this.config = { ...this.config, ...config };
    this.db.setSetting('obs_websocket_config', JSON.stringify(this.config));
    logger.obs('Config saved', { config: this.config });
  }

  /**
   * Save event mappings
   */
  saveEventMappings(mappings) {
    this.eventMappings = mappings;
    this.db.setSetting('obs_event_mappings', JSON.stringify(mappings));
    logger.obs('Event mappings saved', { count: mappings.length });
  }

  /**
   * Connect to OBS
   * @param {string} host - Optional host override
   * @param {number} port - Optional port override
   * @param {string} password - Optional password override
   */
  async connect(host = null, port = null, password = null) {
    // Use provided parameters or fall back to config
    const connectHost = host || this.config.host;
    const connectPort = port || this.config.port;
    const connectPassword = password || this.config.password;

    // Save config if parameters were provided
    if (host || port || password) {
      this.saveConfig({
        host: connectHost,
        port: connectPort,
        password: connectPassword,
        enabled: true
      });
    }

    try {
      await this.obs.connect(
        `ws://${connectHost}:${connectPort}`,
        connectPassword
      );
      this.connected = true;
      logger.obs('Connected to OBS', {
        host: connectHost,
        port: connectPort
      });

      // Emit Socket.IO event
      if (this.io) {
        this.io.emit('obs:connected', {
          host: connectHost,
          port: connectPort
        });
      }

      return true;
    } catch (error) {
      this.connected = false;
      logger.error('Failed to connect to OBS', {
        error: error.message,
        host: connectHost,
        port: connectPort
      });

      // Emit Socket.IO event
      if (this.io) {
        this.io.emit('obs:error', {
          error: error.message
        });
      }

      return false;
    }
  }

  /**
   * Disconnect from OBS
   */
  async disconnect() {
    if (this.connected) {
      try {
        await this.obs.disconnect();
        this.connected = false;
        logger.obs('Disconnected from OBS');

        // Emit Socket.IO event
        if (this.io) {
          this.io.emit('obs:disconnected');
        }
      } catch (error) {
        logger.error('Failed to disconnect from OBS', { error: error.message });
      }
    }
  }

  /**
   * Handle TikTok event and trigger OBS actions
   */
  async handleEvent(eventType, eventData) {
    if (!this.connected || !this.config.enabled) return;

    const matchingMappings = this.eventMappings.filter(mapping => {
      if (mapping.event_type !== eventType) return false;

      // Check conditions
      if (mapping.conditions) {
        return this.checkConditions(mapping.conditions, eventData);
      }

      return true;
    });

    for (const mapping of matchingMappings) {
      await this.executeAction(mapping.action, eventData);
    }
  }

  /**
   * Check if conditions are met
   */
  checkConditions(conditions, eventData) {
    // Example: { field: 'coins', operator: '>=', value: 1000 }
    const { field, operator, value } = conditions;
    const fieldValue = eventData[field];

    switch (operator) {
      case '>=': return fieldValue >= value;
      case '>': return fieldValue > value;
      case '<=': return fieldValue <= value;
      case '<': return fieldValue < value;
      case '==': return fieldValue == value;
      case '!=': return fieldValue != value;
      default: return false;
    }
  }

  /**
   * Execute OBS action
   */
  async executeAction(action, eventData) {
    try {
      switch (action.type) {
        case 'switch_scene':
          await this.switchScene(action.scene_name);
          break;

        case 'toggle_source':
          await this.toggleSource(action.scene_name, action.source_name, action.visible);
          break;

        case 'set_filter':
          await this.setFilter(action.source_name, action.filter_name, action.enabled);
          break;

        case 'delay':
          await new Promise(resolve => setTimeout(resolve, action.duration));
          break;

        default:
          logger.warn('Unknown OBS action type', { type: action.type });
      }

      logger.obs('Action executed', { action: action.type });
    } catch (error) {
      logger.error('Failed to execute OBS action', {
        action: action.type,
        error: error.message
      });
    }
  }

  /**
   * Switch to a scene
   */
  async switchScene(sceneName) {
    await this.obs.call('SetCurrentProgramScene', { sceneName });
    logger.obs('Switched scene', { sceneName });
  }

  /**
   * Toggle source visibility
   */
  async toggleSource(sceneName, sourceName, visible) {
    await this.obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId: await this.getSceneItemId(sceneName, sourceName),
      sceneItemEnabled: visible
    });
    logger.obs('Toggled source', { sceneName, sourceName, visible });
  }

  /**
   * Set filter enabled/disabled
   */
  async setFilter(sourceName, filterName, enabled) {
    await this.obs.call('SetSourceFilterEnabled', {
      sourceName,
      filterName,
      filterEnabled: enabled
    });
    logger.obs('Set filter', { sourceName, filterName, enabled });
  }

  /**
   * Get scene item ID by name
   */
  async getSceneItemId(sceneName, sourceName) {
    const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName });
    const item = sceneItems.find(i => i.sourceName === sourceName);
    return item ? item.sceneItemId : null;
  }

  /**
   * Get list of scenes
   */
  async getScenes() {
    if (!this.connected) return [];
    try {
      const { scenes } = await this.obs.call('GetSceneList');
      return scenes.map(s => s.sceneName);
    } catch (error) {
      logger.error('Failed to get scenes', { error: error.message });
      return [];
    }
  }

  /**
   * Get list of sources in a scene
   */
  async getSources(sceneName) {
    if (!this.connected) return [];
    try {
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName });
      return sceneItems.map(i => i.sourceName);
    } catch (error) {
      logger.error('Failed to get sources', { error: error.message });
      return [];
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.connected,
      enabled: this.config.enabled,
      host: this.config.host,
      port: this.config.port
    };
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Alias for switchScene (for server.js compatibility)
   */
  async setScene(sceneName) {
    return await this.switchScene(sceneName);
  }

  /**
   * Set source visibility (for server.js compatibility)
   */
  async setSourceVisibility(sourceName, visible, sceneName) {
    if (!sceneName) {
      // Get current scene
      const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
      sceneName = currentProgramSceneName;
    }
    return await this.toggleSource(sceneName, sourceName, visible);
  }

  /**
   * Set filter enabled/disabled (alias for compatibility)
   */
  async setFilterEnabled(sourceName, filterName, enabled) {
    return await this.setFilter(sourceName, filterName, enabled);
  }
}

module.exports = OBSWebSocketManager;
