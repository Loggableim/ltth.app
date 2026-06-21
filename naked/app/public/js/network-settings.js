/**
 * Network Access Settings UI Handler
 * Manages the network access configuration interface (bind mode, tunnels, external URLs)
 */

(function() {
  'use strict';

  // Guard – only run if the section is present
  if (!document.getElementById('network-bind-mode')) return;

  let networkConfig = null;

  // ── DOM helpers ────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  /** Escape a string for safe insertion into HTML. */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showNotification(message, type = 'success') {
    // Reuse existing notification pattern from dashboard if available
    if (window.showToast) {
      window.showToast(message, type);
      return;
    }
    const bar = el('network-notification-bar');
    if (!bar) return;
    bar.textContent = message;
    bar.className = `network-notification ${type}`;
    bar.style.display = 'block';
    setTimeout(() => { bar.style.display = 'none'; }, 4000);
  }

  // ── Data Loading ───────────────────────────────────────────────────────────

  async function loadConfig() {
    try {
      const res = await fetch('/api/network/config');
      const data = await res.json();
      if (data.success) {
        networkConfig = data.config;
        renderAll();
      }
    } catch (e) {
      console.error('[NetworkSettings] Error loading config:', e);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderAll() {
    if (!networkConfig) return;
    renderBindMode();
    renderInterfaces();
    renderTunnel();
    renderExternalURLs();
    renderAccessURLs();
    renderSecurityWarning();
  }

  function renderBindMode() {
    const modeSelect = el('network-bind-mode');
    if (modeSelect) modeSelect.value = networkConfig.bindMode || 'local';
    onBindModeChange();

    const customInput = el('network-custom-address');
    if (customInput) customInput.value = networkConfig.bindAddress || '';
  }

  function onBindModeChange() {
    const mode = el('network-bind-mode') ? el('network-bind-mode').value : (networkConfig ? networkConfig.bindMode : 'local');

    const selectGroup = el('network-select-ifaces-group');
    const customGroup = el('network-custom-address-group');

    if (selectGroup) selectGroup.style.display = mode === 'select' ? 'block' : 'none';
    if (customGroup) customGroup.style.display = mode === 'custom' ? 'block' : 'none';
  }

  function renderInterfaces() {
    const container = el('network-iface-list');
    if (!container) return;

    const ifaces = networkConfig.interfaces || [];
    if (ifaces.length === 0) {
      container.innerHTML = '<p class="text-sm text-gray-500">No interfaces detected.</p>';
      return;
    }

    const selectedIPs = networkConfig.selectedIfaces || [];

    container.innerHTML = ifaces
      .filter(i => i.type !== 'loopback')
      .map(iface => {
        const checked = selectedIPs.includes(iface.ip) ? 'checked' : '';
        const badge = getBadgeHtml(iface.type);
        return `
        <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
          <input type="checkbox" class="network-iface-checkbox" value="${esc(iface.ip)}" ${checked}>
          <span class="flex-1">
            <span class="font-medium text-sm">${esc(iface.label)}</span>
            <span class="text-xs text-gray-400 ml-2">${esc(iface.ip)}</span>
          </span>
          ${badge}
        </label>`;
      }).join('');

    // Also populate custom-address dropdown
    const customSelect = el('network-custom-address-select');
    if (customSelect) {
      const currentCustom = networkConfig.bindAddress || '';
      const manualSelected = currentCustom && !ifaces.find(i => i.ip === currentCustom) ? 'selected' : '';
      customSelect.innerHTML = '<option value="">-- Select Interface --</option>' +
        ifaces.filter(i => i.type !== 'loopback').map(i =>
          `<option value="${esc(i.ip)}" ${i.ip === currentCustom ? 'selected' : ''}>${esc(i.label)} (${esc(i.ip)})</option>`
        ).join('') +
        `<option value="manual" ${manualSelected}>Manual IP...</option>`;
    }
  }

  function getBadgeHtml(type) {
    const colors = {
      'loopback': 'bg-gray-600 text-gray-300',
      'lan-private': 'bg-blue-900 text-blue-300',
      'link-local': 'bg-yellow-900 text-yellow-300',
      'public': 'bg-red-900 text-red-300'
    };
    const labels = {
      'loopback': 'loopback',
      'lan-private': 'private',
      'link-local': 'link-local',
      'public': 'public'
    };
    const cls = colors[type] || 'bg-gray-700 text-gray-400';
    const lbl = labels[type] || type;
    return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${lbl}</span>`;
  }

  function renderTunnel() {
    const providerSelect = el('network-tunnel-provider');
    if (providerSelect) providerSelect.value = networkConfig.tunnelProvider || 'cloudflare';

    const autoStartCheck = el('network-tunnel-autostart');
    if (autoStartCheck) autoStartCheck.checked = networkConfig.tunnelEnabled === true;

    onTunnelProviderChange();

    // Fill config fields
    const cfg = networkConfig.tunnelConfig || {};
    const binaryPath = el('network-tunnel-binary');
    if (binaryPath) binaryPath.value = cfg.binaryPath || '';

    const authToken = el('network-tunnel-ngrok-token');
    if (authToken) authToken.value = cfg.authToken === '***' ? '' : (cfg.authToken || '');

    const subdomain = el('network-tunnel-subdomain');
    if (subdomain) subdomain.value = cfg.subdomain || '';

    const region = el('network-tunnel-region');
    if (region) region.value = cfg.region || '';

    const customCmd = el('network-tunnel-custom-command');
    if (customCmd) customCmd.value = cfg.command || '';

    const namedTunnel = el('network-tunnel-named');
    if (namedTunnel) namedTunnel.value = cfg.namedTunnel || '';

    updateTunnelStatus();
  }

  function onTunnelProviderChange() {
    const provider = el('network-tunnel-provider') ? el('network-tunnel-provider').value : (networkConfig ? networkConfig.tunnelProvider : 'cloudflare');

    const groups = {
      cloudflare: el('tunnel-config-cloudflare'),
      ngrok: el('tunnel-config-ngrok'),
      localtunnel: el('tunnel-config-localtunnel'),
      custom: el('tunnel-config-custom')
    };

    Object.entries(groups).forEach(([key, grp]) => {
      if (grp) grp.style.display = key === provider ? 'block' : 'none';
    });
  }

  function updateTunnelStatus() {
    const statusEl = el('network-tunnel-status');
    const urlEl = el('network-tunnel-url');
    const startBtn = el('network-tunnel-start-btn');
    const stopBtn = el('network-tunnel-stop-btn');

    if (!statusEl) return;

    if (networkConfig.tunnelStarting) {
      statusEl.textContent = 'Starting…';
      statusEl.className = 'text-sm text-yellow-400';
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
    } else if (networkConfig.tunnelURL) {
      statusEl.textContent = 'Active';
      statusEl.className = 'text-sm text-green-400';
      if (urlEl) {
        urlEl.style.display = 'flex';
        const urlText = el('network-tunnel-url-text');
        if (urlText) urlText.textContent = networkConfig.tunnelURL;
      }
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
    } else {
      statusEl.textContent = 'Inactive';
      statusEl.className = 'text-sm text-gray-400';
      if (urlEl) urlEl.style.display = 'none';
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  }

  function renderExternalURLs() {
    const list = el('network-external-url-list');
    if (!list) return;

    const urls = networkConfig.externalURLs || [];
    if (urls.length === 0) {
      list.innerHTML = '<p class="text-sm text-gray-500">No external URLs configured.</p>';
      return;
    }

    list.innerHTML = urls.map(url =>
      `<div class="flex items-center gap-2 p-2 bg-gray-700 rounded mb-1">
        <span class="flex-1 text-sm break-all">${esc(url)}</span>
        <button class="btn btn-sm btn-danger network-remove-url-btn" data-url="${esc(url)}">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>`
    ).join('');

    // Re-init lucide icons for new buttons
    if (window.lucide) window.lucide.createIcons();

    list.querySelectorAll('.network-remove-url-btn').forEach(btn => {
      btn.addEventListener('click', () => removeExternalURL(btn.dataset.url));
    });
  }

  function renderAccessURLs() {
    const container = el('network-access-urls');
    if (!container) return;

    const urls = networkConfig.accessURLs || {};
    const entries = [];

    if (urls.localhost) entries.push({ label: 'Localhost', url: urls.localhost });
    if (urls.local && urls.local !== urls.localhost) entries.push({ label: 'Local IP', url: urls.local });
    (urls.lan || []).forEach(l => entries.push({ label: l.label, url: l.url }));
    if (urls.tunnel) entries.push({ label: '🚇 Tunnel', url: urls.tunnel });
    (urls.external || []).forEach(u => entries.push({ label: '🌐 External', url: u }));

    if (entries.length === 0) {
      container.innerHTML = '<p class="text-sm text-gray-500">No access URLs available.</p>';
      return;
    }

    container.innerHTML = entries.map(e => `
      <div class="flex items-center gap-2 p-2 bg-gray-700 rounded mb-1">
        <span class="text-xs text-gray-400 w-24 flex-shrink-0">${esc(e.label)}</span>
        <span class="flex-1 text-sm font-mono break-all">${esc(e.url)}/dashboard.html</span>
        <button class="btn btn-sm text-gray-400 hover:text-white network-copy-url-btn" data-url="${esc(e.url)}/dashboard.html" title="Copy">
          <i data-lucide="copy" class="w-4 h-4"></i>
        </button>
      </div>`
    ).join('');

    if (window.lucide) window.lucide.createIcons();

    container.querySelectorAll('.network-copy-url-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.url)
          .then(() => showNotification('URL copied to clipboard!'))
          .catch(() => showNotification('Failed to copy', 'error'));
      });
    });
  }

  function renderSecurityWarning() {
    const warn = el('network-security-warning');
    if (!warn) return;

    const mode = networkConfig.bindMode || 'local';
    const hasTunnel = !!networkConfig.tunnelURL;
    const hasExternal = (networkConfig.externalURLs || []).length > 0;

    if (mode !== 'local' || hasTunnel || hasExternal) {
      warn.style.display = 'flex';
    } else {
      warn.style.display = 'none';
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function saveConfig() {
    const bindMode = el('network-bind-mode') ? el('network-bind-mode').value : 'local';
    const customAddress = el('network-custom-address') ? el('network-custom-address').value.trim() : '';

    // Collect selected interfaces
    const selectedIfaces = [];
    document.querySelectorAll('.network-iface-checkbox:checked').forEach(cb => {
      selectedIfaces.push(cb.value);
    });

    // Collect tunnel config
    const provider = el('network-tunnel-provider') ? el('network-tunnel-provider').value : 'cloudflare';
    const tunnelConfig = {};
    const binaryPath = el('network-tunnel-binary');
    if (binaryPath && binaryPath.value) tunnelConfig.binaryPath = binaryPath.value.trim();

    const authToken = el('network-tunnel-ngrok-token');
    if (authToken && authToken.value) tunnelConfig.authToken = authToken.value.trim();

    const subdomain = el('network-tunnel-subdomain');
    if (subdomain && subdomain.value) tunnelConfig.subdomain = subdomain.value.trim();

    const region = el('network-tunnel-region');
    if (region && region.value) tunnelConfig.region = region.value.trim();

    const customCmd = el('network-tunnel-custom-command');
    if (customCmd && customCmd.value) tunnelConfig.command = customCmd.value.trim();

    const namedTunnel = el('network-tunnel-named');
    if (namedTunnel && namedTunnel.value) tunnelConfig.namedTunnel = namedTunnel.value.trim();

    const tunnelEnabled = el('network-tunnel-autostart') ? el('network-tunnel-autostart').checked : false;

    const body = {
      bindMode,
      bindAddress: customAddress,
      selectedIfaces,
      tunnelEnabled,
      tunnelProvider: provider,
      tunnelConfig
    };

    try {
      const res = await fetch('/api/network/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        networkConfig = data.config;
        renderAll();
        if (data.needsRestart) {
          showNotification('⚠️ Bind address changed – restart required for it to take effect.', 'warning');
        } else {
          showNotification('Network settings saved.');
        }
      } else {
        showNotification(data.error || 'Error saving network settings', 'error');
      }
    } catch (e) {
      showNotification('Connection error', 'error');
    }
  }

  async function startTunnel() {
    const startBtn = el('network-tunnel-start-btn');
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Starting…'; }

    try {
      const res = await fetch('/api/network/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        networkConfig.tunnelURL = data.tunnelURL;
        networkConfig.tunnelStarting = false;
        updateTunnelStatus();
        renderSecurityWarning();
        renderAccessURLs();
        showNotification(`Tunnel started: ${data.tunnelURL}`);
      } else {
        showNotification(data.error || 'Failed to start tunnel', 'error');
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start'; }
      }
    } catch (e) {
      showNotification('Connection error while starting tunnel', 'error');
      if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start'; }
    }
  }

  async function stopTunnel() {
    try {
      const res = await fetch('/api/network/tunnel/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        networkConfig.tunnelURL = null;
        networkConfig.tunnelStarting = false;
        updateTunnelStatus();
        renderSecurityWarning();
        renderAccessURLs();
        showNotification('Tunnel stopped.');
      } else {
        showNotification(data.error || 'Failed to stop tunnel', 'error');
      }
    } catch (e) {
      showNotification('Connection error', 'error');
    }
  }

  async function addExternalURL() {
    const input = el('network-external-url-input');
    if (!input || !input.value.trim()) return;
    const url = input.value.trim();

    try {
      const res = await fetch('/api/network/external-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success) {
        networkConfig.externalURLs = data.externalURLs;
        input.value = '';
        renderExternalURLs();
        renderAccessURLs();
        renderSecurityWarning();
        showNotification('External URL added.');
      } else {
        showNotification(data.error || 'Error adding URL', 'error');
      }
    } catch (e) {
      showNotification('Connection error', 'error');
    }
  }

  async function removeExternalURL(url) {
    try {
      const res = await fetch('/api/network/external-url', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success) {
        networkConfig.externalURLs = data.externalURLs;
        renderExternalURLs();
        renderAccessURLs();
        renderSecurityWarning();
        showNotification('External URL removed.');
      } else {
        showNotification(data.error || 'Error removing URL', 'error');
      }
    } catch (e) {
      showNotification('Connection error', 'error');
    }
  }

  // ── Event Listeners ────────────────────────────────────────────────────────

  const bindModeSelect = el('network-bind-mode');
  if (bindModeSelect) bindModeSelect.addEventListener('change', onBindModeChange);

  const providerSelect = el('network-tunnel-provider');
  if (providerSelect) providerSelect.addEventListener('change', onTunnelProviderChange);

  const saveBtn = el('network-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveConfig);

  const startBtn = el('network-tunnel-start-btn');
  if (startBtn) startBtn.addEventListener('click', startTunnel);

  const stopBtn = el('network-tunnel-stop-btn');
  if (stopBtn) stopBtn.addEventListener('click', stopTunnel);

  const addUrlBtn = el('network-add-url-btn');
  if (addUrlBtn) addUrlBtn.addEventListener('click', addExternalURL);

  const urlInput = el('network-external-url-input');
  if (urlInput) {
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addExternalURL();
    });
  }

  const copyTunnelBtn = el('network-tunnel-url-copy');
  if (copyTunnelBtn) {
    copyTunnelBtn.addEventListener('click', () => {
      const urlText = el('network-tunnel-url-text');
      if (urlText) {
        navigator.clipboard.writeText(urlText.textContent)
          .then(() => showNotification('Tunnel URL copied!'))
          .catch(() => showNotification('Failed to copy', 'error'));
      }
    });
  }

  // ── Initial Load ───────────────────────────────────────────────────────────

  loadConfig();

})();
