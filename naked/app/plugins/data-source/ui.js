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

  function updateUI(source, settings) {
    currentSource = source;

    // Cards
    cardEulerstream.classList.toggle('active', source === 'eulerstream');
    cardTikfinity.classList.toggle('active', source === 'tikfinity');

    // Badge
    statusBadge.textContent = source === 'tikfinity' ? 'TikFinity' : 'Eulerstream';
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
        showToast('Fehler beim Laden: ' + err.message, 'error');
      });
  }

  fetchStatus();

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
          showToast(data.message, 'success');
          // UI will be updated via socket event
        } else {
          showToast(data.error || 'Fehler', 'error');
        }
      })
      .catch(function (err) {
        showToast('Fehler: ' + err.message, 'error');
      });
  }

  cardEulerstream.addEventListener('click', onSourceCardClick);
  cardTikfinity.addEventListener('click', onSourceCardClick);

  // ── Save TikFinity settings ─────────────────────────────────────
  btnSaveTikfinity.addEventListener('click', function () {
    var port = parseInt(tikfinityPortInput.value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      showToast('Ungültiger Port (1 – 65535)', 'error');
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
          showToast('Einstellungen gespeichert ✓', 'success');
          if (data.settings) {
            tikfinityPortInput.value = data.settings.tikfinity_ws_port;
          }
        } else {
          showToast(data.error || 'Fehler', 'error');
        }
      })
      .catch(function (err) {
        showToast('Fehler: ' + err.message, 'error');
      });
  });

  // ── Socket events ───────────────────────────────────────────────
  socket.on('datasource:changed', function (data) {
    updateUI(data.newSource);
    if (data.previousSource !== data.newSource) {
      showToast('Datenquelle geändert: ' + data.newSource, 'success');
    }
    // Refresh to get latest settings
    fetchStatus();
  });
})();
