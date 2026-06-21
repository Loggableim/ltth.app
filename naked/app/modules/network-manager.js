'use strict';

/**
 * NetworkManager - Manages network access, CORS, tunnels, and bind addresses.
 *
 * Bind modes:
 *   local  → bind 127.0.0.1  (default, secure)
 *   select → bind 0.0.0.0 but restrict via middleware to selected interfaces
 *   all    → bind 0.0.0.0, allow all LAN interfaces
 *   custom → bind to a specific user-provided IP
 */

const os = require('os');
const { spawn } = require('child_process');
const logger = require('./logger');

// ── helpers ────────────────────────────────────────────────────────────────

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function classifyIP(ip) {
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.')) return 'loopback';
  if (ip.startsWith('169.254.')) return 'link-local';
  if (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  ) return 'lan-private';
  return 'public';
}

function ifaceLabel(name, ip) {
  const n = name.toLowerCase();
  if (n.includes('tailscale') || n.startsWith('ts')) return 'Tailscale VPN';
  if (n.includes('zerotier') || n.startsWith('zt')) return 'ZeroTier';
  if (n.startsWith('docker') || n.startsWith('br-') || n.startsWith('veth')) return 'Docker';
  if (n.includes('wireguard') || n.startsWith('wg')) return 'WireGuard';
  if (n.startsWith('wlan') || n.startsWith('wlp') || n.startsWith('wi-fi') || n.includes('wireless')) return 'WiFi';
  // macOS: en0 is typically WiFi, en1+ can be Ethernet/Thunderbolt
  if (n.match(/^en\d+$/)) return 'Network Adapter';
  if (n.startsWith('eth') || n.startsWith('ens') || n.startsWith('enp') || n.includes('ethernet')) return 'Ethernet';
  if (n.includes('loopback') || n === 'lo') return 'Loopback';
  if (n.startsWith('tun') || n.startsWith('tap')) return 'VPN Tunnel';
  return name;
}

// RFC 1918 private ranges as a regex for origin matching
const PRIVATE_RANGES_REGEX = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|localhost|127\.\d+\.\d+\.\d+)(:\d+)?$/;

// ── NetworkManager ──────────────────────────────────────────────────────────

class NetworkManager {
  constructor(db) {
    this.db = db;

    // Runtime state
    this.tunnelProcess = null;
    this.tunnelURL = null;
    this.tunnelStarting = false;

    // Loaded from DB on init()
    this.bindMode = 'local';
    this.bindAddress = '127.0.0.1';
    this.selectedIfaces = [];
    this.externalURLs = [];
    this.tunnelEnabled = false;
    this.tunnelProvider = 'cloudflare';
    this.tunnelConfig = {};
    this.corsExtra = [];
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Load settings from DB and return the resolved bind address.
   * @returns {{ bindAddress: string }}
   */
  init() {
    this.bindMode = this.db.getSetting('network_bind_mode') || 'local';
    this.bindAddress = this.db.getSetting('network_bind_address') || '127.0.0.1';
    this.selectedIfaces = safeJsonParse(this.db.getSetting('network_selected_ifaces'), []);
    this.externalURLs = safeJsonParse(this.db.getSetting('network_external_urls'), []);
    this.tunnelEnabled = this.db.getSetting('network_tunnel_enabled') === 'true';
    this.tunnelProvider = this.db.getSetting('network_tunnel_provider') || 'cloudflare';
    this.tunnelConfig = safeJsonParse(this.db.getSetting('network_tunnel_config'), {});
    this.corsExtra = safeJsonParse(this.db.getSetting('network_cors_extra'), []);

    const resolved = this._resolveBindAddress();
    logger.info(`🌐 NetworkManager: bind mode="${this.bindMode}", address=${resolved}`);
    return { bindAddress: resolved };
  }

  _resolveBindAddress() {
    switch (this.bindMode) {
      case 'local':
        return '127.0.0.1';
      case 'select':
      case 'all':
        return '0.0.0.0';
      case 'custom':
        return this.bindAddress || '127.0.0.1';
      default:
        return '127.0.0.1';
    }
  }

  // ── Interface Detection ───────────────────────────────────────────────────

  /**
   * Return all detected IPv4 network interfaces.
   * @returns {Array<{name, label, ip, type}>}
   */
  getInterfaces() {
    const ifaces = os.networkInterfaces();
    const result = [];

    for (const [name, addresses] of Object.entries(ifaces)) {
      for (const addr of addresses) {
        if (addr.family !== 'IPv4') continue;
        const type = classifyIP(addr.address);
        result.push({
          name,
          label: ifaceLabel(name, addr.address),
          ip: addr.address,
          type
        });
      }
    }

    // loopback first, then private, then link-local, then public
    const order = { loopback: 0, 'lan-private': 1, 'link-local': 2, public: 3 };
    result.sort((a, b) => (order[a.type] ?? 4) - (order[b.type] ?? 4));
    return result;
  }

  // ── CORS Management ───────────────────────────────────────────────────────

  /**
   * Build the complete CORS allowed-origins list for the given port.
   * @param {number} port
   * @returns {string[]}
   */
  getAllowedOrigins(port) {
    const origins = new Set();

    // Always allow localhost / loopback
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    origins.add('null'); // OBS BrowserSource

    // Allow local fallback ports to query each other during profile-restart recovery.
    for (let localPort = 3000; localPort <= 3050; localPort++) {
      origins.add(`http://localhost:${localPort}`);
      origins.add(`http://127.0.0.1:${localPort}`);
    }

    if (this.bindMode === 'all' || this.bindMode === 'select') {
      // Add all detected LAN IPs
      const ifaces = this.getInterfaces();
      for (const iface of ifaces) {
        if (iface.type !== 'loopback') {
          origins.add(`http://${iface.ip}:${port}`);
        }
      }
      // For "select" mode, restrict to selected interfaces only (extra IPs still added so
      // browser requests are not blocked by CORS before the IP middleware fires).
      if (this.bindMode === 'select' && this.selectedIfaces.length > 0) {
        // Keep only selected + loopback
        for (const iface of ifaces) {
          if (iface.type !== 'loopback' && !this.selectedIfaces.includes(iface.ip)) {
            origins.delete(`http://${iface.ip}:${port}`);
          }
        }
      }
    }

    if (this.bindMode === 'custom' && this.bindAddress) {
      origins.add(`http://${this.bindAddress}:${port}`);
    }

    // External URLs (both http and https variants)
    for (const url of this.externalURLs) {
      const clean = url.replace(/\/$/, '');
      origins.add(clean);
      // Add both http and https
      if (clean.startsWith('http://')) {
        origins.add(clean.replace('http://', 'https://'));
      } else if (clean.startsWith('https://')) {
        origins.add(clean.replace('https://', 'http://'));
      }
    }

    // Active tunnel URL
    if (this.tunnelURL) {
      origins.add(this.tunnelURL);
      if (this.tunnelURL.startsWith('https://')) {
        origins.add(this.tunnelURL.replace('https://', 'http://'));
      }
    }

    // Extra CORS origins configured by the user
    for (const origin of this.corsExtra) {
      origins.add(origin);
    }

    return Array.from(origins);
  }

  /**
   * Check whether a given origin is allowed (used in CORS middleware callback).
   * @param {string|undefined} origin
   * @param {number} port
   * @returns {boolean}
   */
  isOriginAllowed(origin, port) {
    // No origin → allow (curl, server-to-server, OBS)
    if (!origin) return true;

    const allowed = this.getAllowedOrigins(port);

    // Exact match
    if (allowed.includes(origin)) return true;

    // In LAN modes, also allow any private-network origin dynamically
    if (this.bindMode === 'all' || this.bindMode === 'select') {
      if (PRIVATE_RANGES_REGEX.test(origin)) return true;
    }

    return false;
  }

  // ── IP Restriction Middleware (for "select" mode) ─────────────────────────

  /**
   * Returns Express middleware that restricts access to selected interfaces.
   * In non-"select" mode this is a pass-through.
   */
  getIPRestrictionMiddleware() {
    return (req, res, next) => {
      if (this.bindMode !== 'select' || this.selectedIfaces.length === 0) {
        return next();
      }

      const remoteAddr = req.socket.remoteAddress || '';
      const localAddr = req.socket.localAddress || '';

      // Always allow loopback
      const loopbacks = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      if (loopbacks.some(l => remoteAddr.includes(l) || localAddr.includes(l))) {
        return next();
      }

      // Check if the local address (the interface it came in on) is selected
      const normalizedLocal = localAddr.replace('::ffff:', '');
      if (this.selectedIfaces.includes(normalizedLocal)) {
        return next();
      }

      // Also check remote address (client IP) against selected list
      const normalizedRemote = remoteAddr.replace('::ffff:', '');
      if (this.selectedIfaces.includes(normalizedRemote)) {
        return next();
      }

      logger.warn(`🚫 NetworkManager: blocked request from ${remoteAddr} (not in selected interfaces)`);
      return res.status(403).json({ error: 'Access denied: this network interface is not allowed.' });
    };
  }

  // ── Tunnel Management ─────────────────────────────────────────────────────

  /**
   * Start a tunnel with the configured provider.
   * @param {number} port
   * @returns {Promise<string>} Resolved tunnel URL
   */
  async startTunnel(port) {
    if (this.tunnelProcess) {
      throw new Error('A tunnel is already running. Stop it first.');
    }

    this.tunnelStarting = true;
    this.tunnelURL = null;

    try {
      const url = await this._spawnTunnel(port);
      this.tunnelURL = url;
      this.tunnelStarting = false;
      logger.info(`🚇 Tunnel started: ${url}`);
      return url;
    } catch (err) {
      this.tunnelStarting = false;
      this.tunnelProcess = null;
      throw err;
    }
  }

  /**
   * Stop the running tunnel.
   */
  stopTunnel() {
    if (!this.tunnelProcess) return;
    try {
      this.tunnelProcess.kill('SIGTERM');
    } catch (_) {}
    this.tunnelProcess = null;
    this.tunnelURL = null;
    this.tunnelStarting = false;
    logger.info('🚇 Tunnel stopped.');
  }

  _spawnTunnel(port) {
    return new Promise((resolve, reject) => {
      const provider = this.tunnelProvider;
      const cfg = this.tunnelConfig || {};
      const TIMEOUT_MS = 30000;

      let child;
      let resolved = false;

      const done = (url) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(url);
      };

      const fail = (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        if (child && !child.killed) child.kill('SIGTERM');
        reject(err);
      };

      const timer = setTimeout(() => {
        fail(new Error(`Tunnel URL not detected within ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);

      if (provider === 'cloudflare') {
        const bin = cfg.binaryPath || 'cloudflared';
        const args = ['tunnel', '--url', `http://localhost:${port}`];

        if (cfg.namedTunnel) {
          // Named tunnel: cloudflared tunnel run <name>
          args.splice(0, args.length, 'tunnel', 'run', cfg.namedTunnel);
        }

        child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        this.tunnelProcess = child;

        const handler = (data) => {
          const text = data.toString();
          // Cloudflare prints the URL as: https://<random>.trycloudflare.com
          const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (match) done(match[0]);
          // Also handle named tunnel URLs
          const match2 = text.match(/https:\/\/[^\s"]+\.cfargotunnel\.com/);
          if (match2) done(match2[0]);
        };
        child.stdout.on('data', handler);
        child.stderr.on('data', handler);

      } else if (provider === 'ngrok') {
        const bin = cfg.binaryPath || 'ngrok';
        const args = ['http', String(port)];
        if (cfg.authToken) args.push('--authtoken', cfg.authToken);
        if (cfg.subdomain) args.push('--subdomain', cfg.subdomain);
        if (cfg.region) args.push('--region', cfg.region);

        child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        this.tunnelProcess = child;

        // ngrok exposes its API on localhost:4040
        const pollInterval = setInterval(async () => {
          try {
            const http = require('http');
            const apiUrl = 'http://127.0.0.1:4040/api/tunnels';
            await new Promise((res2, rej2) => {
              http.get(apiUrl, (r) => {
                let body = '';
                r.on('data', d => { body += d; });
                r.on('end', () => {
                  try {
                    const data = JSON.parse(body);
                    const tunnel = (data.tunnels || []).find(t => t.proto === 'https');
                    if (tunnel) {
                      clearInterval(pollInterval);
                      done(tunnel.public_url);
                    }
                    res2();
                  } catch (_) { res2(); }
                });
              }).on('error', () => res2());
            });
          } catch (_) {}
        }, 1000);

        child.on('exit', () => clearInterval(pollInterval));

      } else if (provider === 'localtunnel') {
        const args = ['localtunnel', '--port', String(port)];
        if (cfg.subdomain) args.push('--subdomain', cfg.subdomain);

        child = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        this.tunnelProcess = child;

        child.stdout.on('data', (data) => {
          const text = data.toString();
          const match = text.match(/https?:\/\/[^\s]+\.loca\.lt/);
          if (match) done(match[0]);
        });

      } else if (provider === 'custom') {
        if (cfg.allowCustomTunnelCommand !== true) {
          fail(new Error('Custom tunnel commands are disabled. Set allowCustomTunnelCommand=true to enable this local-only advanced option.'));
          return;
        }

        const command = (cfg.command || '').replace('{{PORT}}', String(port));
        if (!command) {
          fail(new Error('Custom tunnel command is empty'));
          return;
        }

        const parts = command.split(/\s+/);
        // Note: simple whitespace splitting does not handle quoted arguments.
        // Document that custom commands should not contain quoted arguments with spaces.
        child = spawn(parts[0], parts.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
        this.tunnelProcess = child;

        const handler = (data) => {
          const text = data.toString();
          const match = text.match(/https:\/\/[^\s"']+/);
          if (match) done(match[0]);
        };
        child.stdout.on('data', handler);
        child.stderr.on('data', handler);

      } else {
        fail(new Error(`Unknown tunnel provider: ${provider}`));
        return;
      }

      child.on('error', (err) => {
        fail(new Error(`Failed to spawn tunnel process: ${err.message}`));
      });

      child.on('exit', (code) => {
        if (!resolved) {
          fail(new Error(`Tunnel process exited prematurely (code ${code})`));
        }
        this.tunnelProcess = null;
        if (this.tunnelURL) {
          logger.warn('🚇 Tunnel process exited while URL was active.');
          this.tunnelURL = null;
        }
      });
    });
  }

  // ── External URL Management ───────────────────────────────────────────────

  addExternalURL(url) {
    const clean = url.trim().replace(/\/$/, '');
    if (!clean) throw new Error('URL must not be empty');
    if (!this.externalURLs.includes(clean)) {
      this.externalURLs.push(clean);
      this.db.setSetting('network_external_urls', JSON.stringify(this.externalURLs));
    }
    return this.externalURLs;
  }

  removeExternalURL(url) {
    const clean = url.trim().replace(/\/$/, '');
    this.externalURLs = this.externalURLs.filter(u => u !== clean);
    this.db.setSetting('network_external_urls', JSON.stringify(this.externalURLs));
    return this.externalURLs;
  }

  // ── Access URL Generation ─────────────────────────────────────────────────

  /**
   * Returns all URLs through which the server is accessible.
   * @param {number} port
   */
  getAccessURLs(port) {
    const local = `http://127.0.0.1:${port}`;
    const localhost = `http://localhost:${port}`;

    const lan = [];
    if (this.bindMode === 'all' || this.bindMode === 'select' || this.bindMode === 'custom') {
      const ifaces = this.getInterfaces();
      for (const iface of ifaces) {
        if (iface.type === 'loopback') continue;
        if (this.bindMode === 'select' && this.selectedIfaces.length > 0 && !this.selectedIfaces.includes(iface.ip)) continue;
        if (this.bindMode === 'custom' && iface.ip !== this.bindAddress) continue;
        lan.push({ ip: iface.ip, label: iface.label, url: `http://${iface.ip}:${port}` });
      }
    }

    const custom = (this.bindMode === 'custom' && this.bindAddress)
      ? `http://${this.bindAddress}:${port}`
      : null;

    const primary = this.tunnelURL || custom || (lan.length > 0 ? lan[0].url : localhost);

    return {
      local,
      localhost,
      lan,
      custom,
      external: [...this.externalURLs],
      tunnel: this.tunnelURL || null,
      primary
    };
  }

  // ── Full Config ───────────────────────────────────────────────────────────

  /**
   * Returns the full network config for API responses.
   * @param {number} port
   */
  getConfig(port) {
    return {
      bindMode: this.bindMode,
      bindAddress: this.bindAddress,
      resolvedBindAddress: this._resolveBindAddress(),
      selectedIfaces: this.selectedIfaces,
      externalURLs: this.externalURLs,
      tunnelEnabled: this.tunnelEnabled,
      tunnelProvider: this.tunnelProvider,
      tunnelConfig: this._safeTunnelConfig(),
      tunnelURL: this.tunnelURL,
      tunnelStarting: this.tunnelStarting,
      corsExtra: this.corsExtra,
      interfaces: this.getInterfaces(),
      accessURLs: this.getAccessURLs(port),
      allowedOrigins: this.getAllowedOrigins(port)
    };
  }

  /** Strip sensitive fields from tunnel config before sending to client */
  _safeTunnelConfig() {
    const cfg = { ...this.tunnelConfig };
    if (cfg.authToken) cfg.authToken = '***';
    return cfg;
  }

  // ── Settings Persistence ──────────────────────────────────────────────────

  /**
   * Update settings from an API request body and persist.
   * @param {object} body
   */
  applyConfig(body) {
    const bindModeChanged = body.bindMode !== undefined && body.bindMode !== this.bindMode;
    const bindAddressChanged = body.bindAddress !== undefined && body.bindAddress !== this.bindAddress;
    const needsRestart = bindModeChanged || bindAddressChanged;

    if (
      (body.tunnelProvider === 'custom' || this.tunnelProvider === 'custom') &&
      body.tunnelConfig &&
      typeof body.tunnelConfig === 'object' &&
      body.tunnelConfig.command &&
      body.tunnelConfig.allowCustomTunnelCommand !== true
    ) {
      throw new Error('Custom tunnel commands are disabled. Set allowCustomTunnelCommand=true to enable this local-only advanced option.');
    }

    if (body.bindMode !== undefined) {
      const valid = ['local', 'select', 'all', 'custom'];
      if (!valid.includes(body.bindMode)) throw new Error(`Invalid bindMode: ${body.bindMode}`);
      this.bindMode = body.bindMode;
      this.db.setSetting('network_bind_mode', this.bindMode);
    }

    if (body.bindAddress !== undefined) {
      this.bindAddress = body.bindAddress;
      this.db.setSetting('network_bind_address', this.bindAddress);
    }

    if (body.selectedIfaces !== undefined) {
      this.selectedIfaces = Array.isArray(body.selectedIfaces) ? body.selectedIfaces : [];
      this.db.setSetting('network_selected_ifaces', JSON.stringify(this.selectedIfaces));
    }

    if (body.externalURLs !== undefined) {
      this.externalURLs = Array.isArray(body.externalURLs) ? body.externalURLs : [];
      this.db.setSetting('network_external_urls', JSON.stringify(this.externalURLs));
    }

    if (body.corsExtra !== undefined) {
      this.corsExtra = Array.isArray(body.corsExtra) ? body.corsExtra : [];
      this.db.setSetting('network_cors_extra', JSON.stringify(this.corsExtra));
    }

    if (body.tunnelEnabled !== undefined) {
      this.tunnelEnabled = Boolean(body.tunnelEnabled);
      this.db.setSetting('network_tunnel_enabled', String(this.tunnelEnabled));
    }

    if (body.tunnelProvider !== undefined) {
      const validProviders = ['cloudflare', 'ngrok', 'localtunnel', 'custom'];
      if (!validProviders.includes(body.tunnelProvider)) throw new Error(`Invalid tunnelProvider: ${body.tunnelProvider}`);
      this.tunnelProvider = body.tunnelProvider;
      this.db.setSetting('network_tunnel_provider', this.tunnelProvider);
    }

    if (body.tunnelConfig !== undefined && typeof body.tunnelConfig === 'object') {
      // Preserve existing authToken if client sends '***' (masked)
      const incoming = body.tunnelConfig;
      if (incoming.authToken === '***') {
        incoming.authToken = this.tunnelConfig.authToken || '';
      }
      this.tunnelConfig = incoming;
      this.db.setSetting('network_tunnel_config', JSON.stringify(this.tunnelConfig));
    }

    return { needsRestart };
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  shutdown() {
    this.stopTunnel();
  }
}

module.exports = NetworkManager;
