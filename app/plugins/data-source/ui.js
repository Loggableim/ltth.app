'use strict';

(function () {
  // ── DOM references ──────────────────────────────────────────────
  var cardEulerstream = document.getElementById('card-eulerstream');
  var cardTikfinity = document.getElementById('card-tikfinity');
  var statusBadge = document.getElementById('status-badge');
  var tikfinitySettingsCard = document.getElementById('tikfinity-settings-card');
  var tikfinityPortInput = document.getElementById('tikfinity-port');
  var btnSaveTikfinity = document.getElementById('btn-save-tikfinity');
  var toastEl = document.getElementById('toast');

  var currentSource = 'eulerstream';

  // ── Socket.IO ───────────────────────────────────────────────────
  var socket = io();

  // ── Helpers ─────────────────────────────────────────────────────
  function showToast(message, type) {
    toastEl.textContent = message;
    toastEl.className = 'toast ' + (type || 'success') + ' show';
    setTimeout(function () {
      toastEl.className = 'toast';
    }, 3000);
  }

  function translate(key, params) {
    var translation = window.i18n?.t(key, params || {});
    return translation && translation !== key ? translation : '';
  }

  function showLocalizedToast(key, type, params) {
    var message = translate(key, params);
    if (message) showToast(message, type);
  }

  function getSourceLabel(source) {
    if (source === 'tikfinity') {
      return window.i18n?.initialized
        ? window.i18n.t('plugins.data-source.data_source.ui.sources.tikfinity')
        : 'TikFinity';
    }
    return window.i18n?.initialized
      ? window.i18n.t('plugins.data-source.data_source.ui.sources.eulerstream')
      : 'Eulerstream';
  }

  function updateUI(source, settings) {
    currentSource = source;

    // Cards
    cardEulerstream.classList.toggle('active', source === 'eulerstream');
    cardTikfinity.classList.toggle('active', source === 'tikfinity');

    // Badge
    statusBadge.setAttribute('data-i18n', `plugins.data-source.data_source.ui.sources.${source}`);
    statusBadge.textContent = getSourceLabel(source);
    statusBadge.className = 'status-badge ' + source;

    // TikFinity settings visibility
    tikfinitySettingsCard.style.display = source === 'tikfinity' ? '' : 'none';

    // Port input
    if (settings && settings.tikfinity_ws_port !== undefined) {
      tikfinityPortInput.value = settings.tikfinity_ws_port;
    }
  }

  // ── Initial load ────────────────────────────────────────────────
  function fetchStatus() {
    fetch('/api/data-source/status')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          updateUI(data.currentSource, data.settings);
        }
      })
      .catch(function (err) {
        showLocalizedToast('plugins.data-source.data_source.ui.runtime.loadFailed', 'error');
      });
  }

  if (window.i18n?.ready) window.i18n.ready.then(fetchStatus);
  else fetchStatus();

  window.i18n?.onLanguageChange(function () {
    updateUI(currentSource);
  });

  // ── Source card clicks ──────────────────────────────────────────
  function onSourceCardClick(e) {
    var card = e.currentTarget;
    var source = card.getAttribute('data-source');
    if (!source || source === currentSource) return;

    fetch('/api/data-source/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: source })
    })
      .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success) {
            // Apply the successful local REST response immediately. Socket.IO
            // still synchronises other dashboards, but the initiating panel
            // must not depend on that asynchronous delivery to show its real
            // TikFinity settings.
            updateUI(data.newSource);
            showLocalizedToast('plugins.data-source.data_source.ui.runtime.sourceChanged', 'success', { source: getSourceLabel(data.newSource) });
          } else {
          showLocalizedToast('plugins.data-source.data_source.ui.runtime.switchFailed', 'error');
        }
      })
      .catch(function (err) {
        showLocalizedToast('plugins.data-source.data_source.ui.runtime.switchFailed', 'error');
      });
  }

  cardEulerstream.addEventListener('click', onSourceCardClick);
  cardTikfinity.addEventListener('click', onSourceCardClick);

  // ── Save TikFinity settings ─────────────────────────────────────
  btnSaveTikfinity.addEventListener('click', function () {
    var port = parseInt(tikfinityPortInput.value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      showLocalizedToast('plugins.data-source.data_source.ui.runtime.invalidPort', 'error');
      return;
    }

    fetch('/api/data-source/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tikfinity_ws_port: port })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          showLocalizedToast('plugins.data-source.data_source.ui.runtime.settingsSaved', 'success');
          if (data.settings) {
            tikfinityPortInput.value = data.settings.tikfinity_ws_port;
          }
        } else {
          showLocalizedToast('plugins.data-source.data_source.ui.runtime.settingsSaveFailed', 'error');
        }
      })
      .catch(function (err) {
        showLocalizedToast('plugins.data-source.data_source.ui.runtime.settingsSaveFailed', 'error');
      });
  });

  // ── Socket events ───────────────────────────────────────────────
  socket.on('datasource:changed', function (data) {
    updateUI(data.newSource);
    if (data.previousSource !== data.newSource) {
      showLocalizedToast('plugins.data-source.data_source.ui.runtime.sourceChanged', 'success', { source: getSourceLabel(data.newSource) });
    }
    // Refresh to get latest settings
    fetchStatus();
  });
})();
