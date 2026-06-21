/**
 * CoinBattle Admin UI JavaScript
 * Handles admin panel interactions and real-time updates
 */

(function() {
  'use strict';

  // Socket.io connection
  const socket = io();

  // Current state
  let currentState = {
    active: false,
    match: null,
    leaderboard: [],
    teamScores: null,
    multiplier: { active: false, value: 1.0 },
    config: {}
  };

  let translations = {};
  let currentLanguage = 'en';

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Initialize users management event delegation
   */
  function initUsersManagement() {
    const container = document.getElementById('users-list');
    
    // Check if container exists (it's only present on the CoinBattle UI page)
    if (!container) {
      return;
    }
    
    // Use event delegation for delete buttons
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-user-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        
        const userId = btn.dataset.userId;
        const nickname = btn.dataset.nickname;
        
        if (userId) {
          deleteUser(userId, nickname);
        }
      }
    });
  }

  // Initialize on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initButtons();
    initSocket();
    loadConfig();
    loadTranslations();
    updateOverlayURL();
    loadPyramidConfig(); // Load pyramid config on page load
    loadLikesPointsConfig(); // Load likes points config on page load
    initLeaderboardTabs(); // Initialize leaderboard sub-tabs
    loadSeasonInfo(); // Load season info
    initUsersManagement(); // Initialize users management event delegation
  });

  /**
   * Initialize tab switching
   */
  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load data for specific tabs
        if (tabName === 'leaderboard') {
          loadLifetimeLeaderboard();
          loadSeasonInfo();
        } else if (tabName === 'history') {
          loadMatchHistory();
        }
      });
    });
  }

  /**
   * Initialize button event listeners
   */
  function initButtons() {
    // Match control buttons
    document.getElementById('btn-start-match').addEventListener('click', startMatch);
    document.getElementById('btn-end-match').addEventListener('click', endMatch);
    document.getElementById('btn-pause-match').addEventListener('click', togglePause);
    document.getElementById('btn-extend-match').addEventListener('click', extendMatch);
    document.getElementById('btn-activate-multiplier').addEventListener('click', activateMultiplier);

    // Simulation buttons
    document.getElementById('btn-start-simulation').addEventListener('click', startSimulation);
    document.getElementById('btn-stop-simulation').addEventListener('click', stopSimulation);

    // Settings buttons
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-reset-settings').addEventListener('click', resetSettings);
    document.getElementById('btn-copy-url').addEventListener('click', copyOverlayURL);
    document.getElementById('btn-preview-overlay').addEventListener('click', previewOverlay);

    // Pyramid mode buttons
    const btnSavePyramid = document.getElementById('btn-save-pyramid-settings');
    if (btnSavePyramid) {
      btnSavePyramid.addEventListener('click', savePyramidSettings);
    }
    
    const btnStartPyramid = document.getElementById('btn-start-pyramid');
    if (btnStartPyramid) {
      btnStartPyramid.addEventListener('click', startPyramid);
    }
    
    // Likes points buttons
    const btnSaveLikes = document.getElementById('btn-save-likes-settings');
    if (btnSaveLikes) {
      btnSaveLikes.addEventListener('click', saveLikesPointsSettings);
    }
    
    const btnStopPyramid = document.getElementById('btn-stop-pyramid');
    if (btnStopPyramid) {
      btnStopPyramid.addEventListener('click', stopPyramid);
    }
    
    const btnCopyPyramidUrl = document.getElementById('btn-copy-pyramid-url');
    if (btnCopyPyramidUrl) {
      btnCopyPyramidUrl.addEventListener('click', copyPyramidURL);
    }
    
    const btnPreviewPyramid = document.getElementById('btn-preview-pyramid');
    if (btnPreviewPyramid) {
      btnPreviewPyramid.addEventListener('click', previewPyramidOverlay);
    }

    // Season management button
    const btnSaveSeason = document.getElementById('btn-save-season');
    if (btnSaveSeason) {
      btnSaveSeason.addEventListener('click', saveSeason);
    }

    // Language selector
    document.getElementById('languageSelector').addEventListener('change', (e) => {
      currentLanguage = e.target.value;
      loadTranslations();
    });
    
    // Post-match duration sliders
    document.getElementById('setting-postmatch-lb-duration').addEventListener('input', (e) => {
      document.getElementById('lb-duration-value').textContent = e.target.value;
    });
    
    document.getElementById('setting-postmatch-credits-duration').addEventListener('input', (e) => {
      document.getElementById('credits-duration-value').textContent = e.target.value;
    });
  }

  /**
   * Initialize socket event listeners
   */
  function initSocket() {
    // Request initial state
    socket.emit('coinbattle:get-state');

    // Match state updates
    socket.on('coinbattle:match-state', (state) => {
      currentState = state;
      updateUI();
    });

    // Timer updates
    socket.on('coinbattle:timer-update', (data) => {
      updateTimer(data);
    });

    // Leaderboard updates
    socket.on('coinbattle:leaderboard-update', (data) => {
      currentState.leaderboard = data.leaderboard;
      currentState.teamScores = data.teamScores;
      updateLeaderboard();
    });

    // Match events
    socket.on('coinbattle:match-started', () => {
      showNotification('Match started!', 'success');
      socket.emit('coinbattle:get-state');
    });

    socket.on('coinbattle:match-ended', (data) => {
      showNotification('Match ended!', 'info');
      socket.emit('coinbattle:get-state');
    });

    socket.on('coinbattle:match-paused', () => {
      showNotification('Match paused', 'warning');
    });

    socket.on('coinbattle:match-resumed', () => {
      showNotification('Match resumed', 'success');
    });

    socket.on('coinbattle:match-extended', (data) => {
      showNotification(`Match extended by ${data.additionalSeconds}s`, 'info');
    });

    // Multiplier events
    socket.on('coinbattle:multiplier-activated', (data) => {
      currentState.multiplier = {
        active: true,
        value: data.multiplier,
        endTime: data.endTime
      };
      showNotification(`${data.multiplier}x multiplier activated!`, 'success');
      updateMultiplierDisplay();
    });

    socket.on('coinbattle:multiplier-ended', () => {
      currentState.multiplier = { active: false, value: 1.0 };
      updateMultiplierDisplay();
      showNotification('Multiplier ended', 'info');
    });

    // Gift events
    socket.on('coinbattle:gift-received', (data) => {
      // Could add visual feedback here
    });

    // Pyramid mode events
    socket.on('pyramid:round-started', (data) => {
      showNotification('Pyramid round started!', 'success');
      document.getElementById('btn-start-pyramid').disabled = true;
      document.getElementById('btn-stop-pyramid').disabled = false;
    });

    socket.on('pyramid:round-ended', (data) => {
      showNotification('Pyramid round ended!', 'info');
      document.getElementById('btn-start-pyramid').disabled = false;
      document.getElementById('btn-stop-pyramid').disabled = true;
    });

    socket.on('pyramid:knockout', (data) => {
      showNotification(`🥊 ${data.newLeader?.nickname} takes the lead!`, 'warning');
    });

    socket.on('pyramid:round-extended', (data) => {
      showNotification(`Pyramid extended by ${data.extension.toFixed(1)}s`, 'info');
    });
  }

  /**
   * Start a match
   */
  async function startMatch() {
    const mode = document.getElementById('match-mode').value;
    const duration = parseInt(document.getElementById('match-duration').value);

    try {
      const response = await fetch('/api/plugins/coinbattle/match/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, duration })
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Match started successfully!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error starting match: ${error.message}`, 'danger');
    }
  }

  /**
   * End current match
   */
  async function endMatch() {
    if (!confirm('Are you sure you want to end the current match?')) {
      return;
    }

    try {
      const response = await fetch('/api/plugins/coinbattle/match/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Match ended successfully!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error ending match: ${error.message}`, 'danger');
    }
  }

  /**
   * Toggle pause/resume
   */
  async function togglePause() {
    const isPaused = currentState.match?.isPaused;
    const endpoint = isPaused ? 'resume' : 'pause';

    try {
      const response = await fetch(`/api/plugins/coinbattle/match/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (!result.success) {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'danger');
    }
  }

  /**
   * Extend match duration
   */
  async function extendMatch() {
    try {
      const response = await fetch('/api/plugins/coinbattle/match/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: 60 })
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Match extended by 60 seconds!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error extending match: ${error.message}`, 'danger');
    }
  }

  /**
   * Activate multiplier
   */
  async function activateMultiplier() {
    try {
      const response = await fetch('/api/plugins/coinbattle/multiplier/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multiplier: 2.0,
          duration: 30,
          activatedBy: 'admin'
        })
      });

      const result = await response.json();
      if (result.success) {
        showNotification('2x Multiplier activated for 30 seconds!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error activating multiplier: ${error.message}`, 'danger');
    }
  }

  /**
   * Start offline simulation
   */
  async function startSimulation() {
    try {
      const response = await fetch('/api/plugins/coinbattle/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Simulation started!', 'success');
        document.getElementById('btn-start-simulation').disabled = true;
        document.getElementById('btn-stop-simulation').disabled = false;
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'danger');
    }
  }

  /**
   * Stop offline simulation
   */
  async function stopSimulation() {
    try {
      const response = await fetch('/api/plugins/coinbattle/simulation/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Simulation stopped!', 'info');
        document.getElementById('btn-start-simulation').disabled = false;
        document.getElementById('btn-stop-simulation').disabled = true;
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'danger');
    }
  }

  /**
   * Load configuration
   */
  async function loadConfig() {
    try {
      const response = await fetch('/api/plugins/coinbattle/config');
      const result = await response.json();

      if (result.success) {
        const config = result.data;
        currentState.config = config;

        // Populate form fields
        document.getElementById('match-mode').value = config.mode || 'solo';
        document.getElementById('match-duration').value = config.matchDuration || 300;
        document.getElementById('setting-autostart').checked = config.autoStart || false;
        document.getElementById('setting-autoreset').checked = config.autoReset !== false;
        document.getElementById('setting-autoextension').checked = config.autoExtension !== false;
        document.getElementById('setting-multipliers').checked = config.enableMultipliers !== false;
        document.getElementById('setting-extension-threshold').value = config.extensionThreshold || 15;
        document.getElementById('setting-extension-duration').value = config.extensionDuration || 60;
        document.getElementById('setting-team-assignment').value = config.teamAssignment || 'random';
        document.getElementById('setting-theme').value = config.theme || 'dark';
        document.getElementById('setting-skin').value = config.skin || 'gold';
        document.getElementById('setting-layout').value = config.layout || 'fullscreen';
        document.getElementById('setting-fontsize').value = config.fontSize || 16;
        document.getElementById('setting-show-avatars').checked = config.showAvatars !== false;
        document.getElementById('setting-show-badges').checked = config.showBadges !== false;
        document.getElementById('setting-toaster-mode').checked = config.toasterMode || false;
        
        // Post-match settings
        const postMatch = config.postMatch || {};
        document.getElementById('setting-postmatch-leaderboard').checked = postMatch.showLeaderboard !== false;
        document.getElementById('setting-postmatch-lb-weekly').checked = postMatch.leaderboardTypes?.includes('weekly') || false;
        document.getElementById('setting-postmatch-lb-season').checked = postMatch.leaderboardTypes?.includes('season') || false;
        document.getElementById('setting-postmatch-lb-lifetime').checked = postMatch.leaderboardTypes?.includes('lifetime') !== false;
        document.getElementById('setting-postmatch-lb-duration').value = postMatch.leaderboardDuration || 15;
        document.getElementById('lb-duration-value').textContent = postMatch.leaderboardDuration || 15;
        document.getElementById('setting-postmatch-credits').checked = postMatch.showWinnerCredits !== false;
        document.getElementById('setting-postmatch-show-xp').checked = postMatch.showXPAwards !== false;
        document.getElementById('setting-postmatch-credits-duration').value = postMatch.winnerCreditsDuration || 10;
        document.getElementById('credits-duration-value').textContent = postMatch.winnerCreditsDuration || 10;
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  /**
   * Save configuration
   */
  async function saveSettings() {
    // Collect selected leaderboard types
    const leaderboardTypes = [];
    if (document.getElementById('setting-postmatch-lb-weekly').checked) leaderboardTypes.push('weekly');
    if (document.getElementById('setting-postmatch-lb-season').checked) leaderboardTypes.push('season');
    if (document.getElementById('setting-postmatch-lb-lifetime').checked) leaderboardTypes.push('lifetime');
    
    const config = {
      mode: document.getElementById('match-mode').value,
      matchDuration: parseInt(document.getElementById('match-duration').value),
      autoStart: document.getElementById('setting-autostart').checked,
      autoReset: document.getElementById('setting-autoreset').checked,
      autoExtension: document.getElementById('setting-autoextension').checked,
      enableMultipliers: document.getElementById('setting-multipliers').checked,
      extensionThreshold: parseInt(document.getElementById('setting-extension-threshold').value),
      extensionDuration: parseInt(document.getElementById('setting-extension-duration').value),
      teamAssignment: document.getElementById('setting-team-assignment').value,
      theme: document.getElementById('setting-theme').value,
      skin: document.getElementById('setting-skin').value,
      layout: document.getElementById('setting-layout').value,
      fontSize: parseInt(document.getElementById('setting-fontsize').value),
      showAvatars: document.getElementById('setting-show-avatars').checked,
      showBadges: document.getElementById('setting-show-badges').checked,
      toasterMode: document.getElementById('setting-toaster-mode').checked,
      language: currentLanguage,
      // Post-match settings
      postMatch: {
        showLeaderboard: document.getElementById('setting-postmatch-leaderboard').checked,
        leaderboardTypes: leaderboardTypes.length > 0 ? leaderboardTypes : ['lifetime'],
        leaderboardDuration: parseInt(document.getElementById('setting-postmatch-lb-duration').value),
        showWinnerCredits: document.getElementById('setting-postmatch-credits').checked,
        winnerCreditsDuration: parseInt(document.getElementById('setting-postmatch-credits-duration').value),
        showXPAwards: document.getElementById('setting-postmatch-show-xp').checked
      }
    };

    try {
      const response = await fetch('/api/plugins/coinbattle/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Settings saved successfully!', 'success');
        currentState.config = config;
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error saving settings: ${error.message}`, 'danger');
    }
  }

  /**
   * Reset settings to defaults
   */
  function resetSettings() {
    if (!confirm('Reset all settings to defaults?')) {
      return;
    }
    loadConfig();
    showNotification('Settings reset to defaults', 'info');
  }

  /**
   * Update overlay URL
   */
  function updateOverlayURL() {
    const url = `${window.location.origin}/plugins/coinbattle/overlay`;
    document.getElementById('overlay-url').value = url;
    
    // Also update pyramid overlay URL
    const pyramidUrlEl = document.getElementById('pyramid-overlay-url');
    if (pyramidUrlEl) {
      pyramidUrlEl.value = `${window.location.origin}/plugins/coinbattle/overlay?pyramidMode=true`;
    }
  }

  /**
   * Copy overlay URL
   */
  async function copyOverlayURL() {
    const input = document.getElementById('overlay-url');
    const url = input.value;
    
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        showNotification('URL copied to clipboard!', 'success');
      } else {
        // Fallback to legacy method
        input.select();
        document.execCommand('copy');
        showNotification('URL copied to clipboard!', 'success');
      }
    } catch (error) {
      // Final fallback - manual selection
      input.select();
      showNotification('Please copy the URL manually (Ctrl+C)', 'warning');
    }
  }

  /**
   * Preview overlay
   */
  function previewOverlay() {
    const url = document.getElementById('overlay-url').value;
    window.open(url, '_blank', 'width=1920,height=1080');
  }

  /**
   * Load lifetime leaderboard
   */
  async function loadLifetimeLeaderboard() {
    const container = document.getElementById('lifetime-leaderboard');
    container.innerHTML = '<p class="loading"><span class="spinner"></span></p>';

    try {
      const response = await fetch('/api/plugins/coinbattle/leaderboard/lifetime?limit=20');
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        container.innerHTML = renderLeaderboardTable(result.data, true);
      } else {
        container.innerHTML = '<p class="loading">No data available</p>';
      }
    } catch (error) {
      container.innerHTML = '<p class="loading">Error loading leaderboard</p>';
    }
  }

  /**
   * Load match history
   */
  async function loadMatchHistory() {
    const container = document.getElementById('match-history');
    container.innerHTML = '<p class="loading"><span class="spinner"></span></p>';

    try {
      const response = await fetch('/api/plugins/coinbattle/history?limit=20');
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        container.innerHTML = result.data.map(match => renderHistoryItem(match)).join('');
      } else {
        container.innerHTML = '<p class="loading">No match history</p>';
      }
    } catch (error) {
      container.innerHTML = '<p class="loading">Error loading history</p>';
    }
  }

  /**
   * Render history item
   */
  function renderHistoryItem(match) {
    const date = new Date(match.start_time * 1000).toLocaleString();
    const duration = formatDuration(match.duration || 0);
    const modeLabel = match.mode === 'team'
      ? 'Team Battle'
      : match.mode === 'pyramid'
        ? 'Pyramid Battle'
        : 'Solo';
    
    return `
      <div class="history-item">
        <div class="history-info">
          <div><strong>Match #${match.id}</strong> - ${modeLabel}</div>
          <div class="history-meta">${date} • Duration: ${duration} • Coins: ${match.total_coins || 0}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="exportMatch(${match.id})">📥 Export</button>
      </div>
    `;
  }

  /**
   * Export match data
   */
  window.exportMatch = async function(matchId) {
    try {
      const response = await fetch(`/api/plugins/coinbattle/export/${matchId}`);
      const result = await response.json();

      if (result.success) {
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `coinbattle-match-${matchId}.json`;
        link.click();
        showNotification('Match data exported!', 'success');
      }
    } catch (error) {
      showNotification(`Error exporting: ${error.message}`, 'danger');
    }
  };

  /**
   * Update UI based on current state
   */
  function updateUI() {
    const isActive = currentState.active;
    const isPaused = currentState.match?.isPaused;
    const isSimulationActive = currentState.config?.enableOfflineSimulation || false;

    // Update status
    const statusText = document.getElementById('match-status-text');
    statusText.textContent = isActive ? (isPaused ? 'Paused' : 'Active') : 'Inactive';
    statusText.className = `stat-value ${isActive ? (isPaused ? 'warning' : 'success') : ''}`;

    // Update buttons
    document.getElementById('btn-start-match').disabled = isActive;
    document.getElementById('btn-end-match').disabled = !isActive;
    document.getElementById('btn-pause-match').disabled = !isActive;
    document.getElementById('btn-pause-match').textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
    document.getElementById('btn-extend-match').disabled = !isActive;
    document.getElementById('btn-activate-multiplier').disabled = !isActive;
    
    // Update simulation button states
    document.getElementById('btn-start-simulation').disabled = isSimulationActive;
    document.getElementById('btn-stop-simulation').disabled = !isSimulationActive;

    // Update stats
    if (isActive && currentState.leaderboard) {
      const totalCoins = currentState.leaderboard.reduce((sum, p) => sum + p.coins, 0);
      document.getElementById('total-coins').textContent = totalCoins.toLocaleString();
      document.getElementById('participant-count').textContent = currentState.leaderboard.length;
    } else {
      document.getElementById('total-coins').textContent = '0';
      document.getElementById('participant-count').textContent = '0';
    }

    // Update leaderboard
    updateLeaderboard();
    updateMultiplierDisplay();
  }

  /**
   * Update timer display
   */
  function updateTimer(data) {
    const timerDisplay = document.getElementById('timer-display');
    const timeRemaining = document.getElementById('time-remaining');

    const minutes = Math.floor(data.remaining / 60);
    const seconds = data.remaining % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    timerDisplay.textContent = timeStr;
    timeRemaining.textContent = timeStr;

    // Color coding
    timerDisplay.className = 'timer-display';
    if (data.remaining < 30) {
      timerDisplay.classList.add('danger');
    } else if (data.remaining < 60) {
      timerDisplay.classList.add('warning');
    }
  }

  /**
   * Update leaderboard display
   */
  function updateLeaderboard() {
    const container = document.getElementById('current-leaderboard');

    if (!currentState.active || !currentState.leaderboard || currentState.leaderboard.length === 0) {
      container.innerHTML = '<p class="loading">No active match</p>';
      return;
    }

    container.innerHTML = renderLeaderboardTable(currentState.leaderboard, false);
  }

  /**
   * Render leaderboard table
   */
  function renderLeaderboardTable(data, showLifetimeStats) {
    let html = '<table class="leaderboard-table"><thead><tr>';
    html += '<th>Rank</th>';
    html += '<th>Player</th>';
    if (!showLifetimeStats && currentState.match?.mode === 'team') {
      html += '<th>Team</th>';
    }
    html += '<th>Coins</th>';
    html += '<th>Gifts</th>';
    if (showLifetimeStats) {
      html += '<th>Matches</th>';
      html += '<th>Wins</th>';
    }
    html += '</tr></thead><tbody>';

    data.forEach((player, index) => {
      html += '<tr>';
      html += `<td><strong>#${index + 1}</strong></td>`;
      html += `<td><div class="player-info">`;
      if (player.profile_picture_url) {
        html += `<img class="player-avatar" src="${escapeHtml(player.profile_picture_url)}" alt="${escapeHtml(player.nickname)}">`;
      } else {
        html += `<div class="player-avatar"></div>`;
      }
      html += `<div class="player-name">${escapeHtml(player.nickname || player.unique_id)}</div>`;
      html += `</div></td>`;
      
      if (!showLifetimeStats && currentState.match?.mode === 'team' && player.team) {
        html += `<td><span class="team-badge ${player.team}">${player.team.toUpperCase()}</span></td>`;
      }
      
      html += `<td><strong>${(player.coins || player.total_coins || 0).toLocaleString()}</strong></td>`;
      html += `<td>${(player.gifts || player.total_gifts || 0).toLocaleString()}</td>`;
      
      if (showLifetimeStats) {
        html += `<td>${player.matches_played || 0}</td>`;
        html += `<td>${player.matches_won || 0}</td>`;
      }
      
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  /**
   * Update multiplier display
   */
  function updateMultiplierDisplay() {
    const card = document.getElementById('multiplier-card');
    
    if (currentState.multiplier?.active) {
      card.style.display = 'block';
      document.getElementById('multiplier-value').textContent = `${currentState.multiplier.value}x`;
      
      // Update countdown
      if (currentState.multiplier.endTime) {
        const updateCountdown = () => {
          const remaining = Math.max(0, Math.floor((currentState.multiplier.endTime - Date.now()) / 1000));
          document.getElementById('multiplier-remaining').textContent = `${remaining}s`;
          
          if (remaining > 0) {
            setTimeout(updateCountdown, 1000);
          }
        };
        updateCountdown();
      }
    } else {
      card.style.display = 'none';
    }
  }

  /**
   * Load translations
   */
  async function loadTranslations() {
    try {
      const response = await fetch(`/plugins/coinbattle/locales/${currentLanguage}.json`);
      translations = await response.json();
      // Could apply translations here
    } catch (error) {
      console.error('Error loading translations:', error);
    }
  }

  /**
   * Show notification
   */
  function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Create toast notification element
    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.minWidth = '300px';
    toast.style.animation = 'slideInRight 0.3s';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Format duration in seconds to readable format
   */
  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  // ==================== PYRAMID MODE FUNCTIONS ====================

  /**
   * Load pyramid settings
   */
  async function loadPyramidConfig() {
    try {
      const response = await fetch('/api/plugins/coinbattle/pyramid/config');
      const result = await response.json();

      if (result.success) {
        const config = result.data;
        
        const enabledEl = document.getElementById('setting-pyramid-enabled');
        if (enabledEl) enabledEl.checked = config.enabled || false;
        
        const autostartEl = document.getElementById('setting-pyramid-autostart');
        if (autostartEl) autostartEl.checked = config.autoStart !== false;
        
        const rowsEl = document.getElementById('setting-pyramid-rows');
        if (rowsEl) rowsEl.value = config.rowCount || 4;
        
        const durationEl = document.getElementById('setting-pyramid-duration');
        if (durationEl) durationEl.value = config.roundDuration || 120;
        
        const extensionEl = document.getElementById('setting-pyramid-extension');
        if (extensionEl) extensionEl.value = config.extensionPerCoin || 0.5;
        
        const maxExtEl = document.getElementById('setting-pyramid-max-extension');
        if (maxExtEl) maxExtEl.value = config.maxExtension || 300;
        
        const coinsEl = document.getElementById('setting-pyramid-coins-per-point');
        if (coinsEl) coinsEl.value = config.coinsPerPoint || 100;
        
        const likesEl = document.getElementById('setting-pyramid-likes-per-point');
        if (likesEl) likesEl.value = config.likesPerPoint || 1;
        
        // XP Rewards settings
        const xpEnabledEl = document.getElementById('setting-pyramid-xp-enabled');
        if (xpEnabledEl) xpEnabledEl.checked = config.xpRewardsEnabled || false;
        
        const xpDistributionEl = document.getElementById('setting-pyramid-xp-distribution');
        if (xpDistributionEl) xpDistributionEl.value = config.xpDistributionMode || 'winner-takes-all';
        
        const xpConversionEl = document.getElementById('setting-pyramid-xp-conversion');
        if (xpConversionEl) xpConversionEl.value = config.xpConversionRate || 1.0;
        
        const xpPlacesEl = document.getElementById('setting-pyramid-xp-places');
        if (xpPlacesEl) xpPlacesEl.value = config.xpRewardedPlaces || 1;
      }
    } catch (error) {
      console.error('Error loading pyramid config:', error);
    }
  }

  /**
   * Load likes points settings
   */
  async function loadLikesPointsConfig() {
    try {
      const response = await fetch('/api/plugins/coinbattle/likes-points/config');
      const result = await response.json();

      if (result.success) {
        const config = result.data;
        
        const enabledEl = document.getElementById('setting-likes-enabled');
        if (enabledEl) enabledEl.checked = config.enabled || false;
        
        const likesEl = document.getElementById('setting-likes-per-point');
        if (likesEl) likesEl.value = config.likesPerPoint || 100;
        
        const sharesEl = document.getElementById('setting-shares-per-point');
        if (sharesEl) sharesEl.value = config.sharesPerPoint || 50;
        
        const followsEl = document.getElementById('setting-follows-per-point');
        if (followsEl) followsEl.value = config.followsPerPoint || 10;
        
        const commentsEl = document.getElementById('setting-comments-per-point');
        if (commentsEl) commentsEl.value = config.commentsPerPoint || 25;
      }
    } catch (error) {
      console.error('Error loading likes points config:', error);
    }
  }

  /**
   * Save pyramid settings
   */
  async function savePyramidSettings() {
    const config = {
      enabled: document.getElementById('setting-pyramid-enabled')?.checked || false,
      autoStart: document.getElementById('setting-pyramid-autostart')?.checked !== false,
      rowCount: parseInt(document.getElementById('setting-pyramid-rows')?.value || 4),
      roundDuration: parseInt(document.getElementById('setting-pyramid-duration')?.value || 120),
      extensionPerCoin: parseFloat(document.getElementById('setting-pyramid-extension')?.value || 0.5),
      maxExtension: parseInt(document.getElementById('setting-pyramid-max-extension')?.value || 300),
      coinsPerPoint: parseInt(document.getElementById('setting-pyramid-coins-per-point')?.value || 100),
      likesPerPoint: parseInt(document.getElementById('setting-pyramid-likes-per-point')?.value || 1),
      xpRewardsEnabled: document.getElementById('setting-pyramid-xp-enabled')?.checked || false,
      xpDistributionMode: document.getElementById('setting-pyramid-xp-distribution')?.value || 'winner-takes-all',
      xpConversionRate: parseFloat(document.getElementById('setting-pyramid-xp-conversion')?.value || 1.0),
      xpRewardedPlaces: parseInt(document.getElementById('setting-pyramid-xp-places')?.value || 1)
    };

    try {
      const response = await fetch('/api/plugins/coinbattle/pyramid/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Pyramid settings saved!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error saving pyramid settings: ${error.message}`, 'danger');
    }
  }

  /**
   * Save likes points settings
   */
  async function saveLikesPointsSettings() {
    // Get and validate inputs
    const enabled = document.getElementById('setting-likes-enabled')?.checked || false;
    
    // Define settings to validate
    const settings = [
      { id: 'setting-likes-per-point', name: 'Likes per Point', default: 100 },
      { id: 'setting-shares-per-point', name: 'Shares per Point', default: 50 },
      { id: 'setting-follows-per-point', name: 'Follows per Point', default: 10 },
      { id: 'setting-comments-per-point', name: 'Comments per Point', default: 25 }
    ];

    // Validate all values
    const values = {};
    for (const setting of settings) {
      const value = parseInt(document.getElementById(setting.id)?.value || setting.default);
      if (isNaN(value) || value < 1) {
        showNotification(`Please enter a valid positive number for ${setting.name}`, 'danger');
        return;
      }
      values[setting.id.replace('setting-', '').replace(/-/g, '_')] = value;
    }

    const config = {
      enabled,
      likesPerPoint: values.likes_per_point,
      sharesPerPoint: values.shares_per_point,
      followsPerPoint: values.follows_per_point,
      commentsPerPoint: values.comments_per_point
    };

    try {
      const response = await fetch('/api/plugins/coinbattle/likes-points/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Likes & Interactions settings saved!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error saving likes settings: ${error.message}`, 'danger');
    }
  }

  /**
   * Start pyramid round
   */
  async function startPyramid() {
    try {
      const response = await fetch('/api/plugins/coinbattle/pyramid/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Pyramid round started!', 'success');
        document.getElementById('btn-start-pyramid').disabled = true;
        document.getElementById('btn-stop-pyramid').disabled = false;
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error starting pyramid: ${error.message}`, 'danger');
    }
  }

  /**
   * Stop pyramid round
   */
  async function stopPyramid() {
    if (!confirm('Are you sure you want to end the pyramid round?')) {
      return;
    }

    try {
      const response = await fetch('/api/plugins/coinbattle/pyramid/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Pyramid round ended!', 'success');
        document.getElementById('btn-start-pyramid').disabled = false;
        document.getElementById('btn-stop-pyramid').disabled = true;
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error stopping pyramid: ${error.message}`, 'danger');
    }
  }

  /**
   * Copy pyramid overlay URL
   */
  async function copyPyramidURL() {
    const input = document.getElementById('pyramid-overlay-url');
    const url = input.value;
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        showNotification('Pyramid URL copied!', 'success');
      } else {
        input.select();
        document.execCommand('copy');
        showNotification('Pyramid URL copied!', 'success');
      }
    } catch (error) {
      input.select();
      showNotification('Please copy manually (Ctrl+C)', 'warning');
    }
  }

  /**
   * Preview pyramid overlay
   */
  function previewPyramidOverlay() {
    const url = document.getElementById('pyramid-overlay-url').value;
    window.open(url, '_blank', 'width=1920,height=1080');
  }

  // ==================== NEW: Season & Leaderboard Management ====================

  /**
   * Initialize leaderboard tab switching
   */
  function initLeaderboardTabs() {
    const leaderboardTabs = document.querySelectorAll('[data-leaderboard]');
    
    leaderboardTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const type = tab.dataset.leaderboard;
        
        // Update active tab
        leaderboardTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Show corresponding view
        document.querySelectorAll('.leaderboard-view').forEach(v => v.style.display = 'none');
        document.getElementById(`${type}-leaderboard-view`).style.display = 'block';
        
        // Load data for the selected type
        if (type === 'lifetime') {
          loadLifetimeLeaderboard();
        } else if (type === 'weekly') {
          loadWeeklyLeaderboard();
        } else if (type === 'season') {
          loadSeasonLeaderboard();
        } else if (type === 'manage') {
          loadUsersForManagement();
        }
      });
    });
  }

  /**
   * Load weekly leaderboard
   */
  async function loadWeeklyLeaderboard() {
    const container = document.getElementById('weekly-leaderboard');
    container.innerHTML = '<p class="loading"><span class="spinner"></span></p>';

    try {
      const response = await fetch('/api/plugins/coinbattle/leaderboard/weekly?limit=20');
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        container.innerHTML = renderLeaderboardTable(result.data, true);
      } else {
        container.innerHTML = '<p class="loading">No data available for this week</p>';
      }
    } catch (error) {
      container.innerHTML = '<p class="loading">Error loading weekly leaderboard</p>';
    }
  }

  /**
   * Load season leaderboard
   */
  async function loadSeasonLeaderboard() {
    const container = document.getElementById('season-leaderboard');
    const infoBox = document.getElementById('season-leaderboard-info');
    container.innerHTML = '<p class="loading"><span class="spinner"></span></p>';

    try {
      const response = await fetch('/api/plugins/coinbattle/leaderboard/season?limit=20');
      const result = await response.json();

      if (result.success && result.season) {
        const startDate = new Date(result.season.start_date * 1000).toLocaleDateString();
        const endDate = new Date(result.season.end_date * 1000).toLocaleDateString();
        infoBox.className = 'alert alert-success';
        infoBox.textContent = `Season: ${result.season.season_name} (${startDate} - ${endDate})`;
        
        if (result.data.length > 0) {
          container.innerHTML = renderLeaderboardTable(result.data, true);
        } else {
          container.innerHTML = '<p class="loading">No data available for this season</p>';
        }
      } else {
        infoBox.className = 'alert alert-info';
        infoBox.textContent = 'No active season. Configure a season above to see season leaderboard';
        container.innerHTML = '<p class="loading">No active season configured</p>';
      }
    } catch (error) {
      container.innerHTML = '<p class="loading">Error loading season leaderboard</p>';
    }
  }

  /**
   * Load users for management
   */
  async function loadUsersForManagement() {
    const container = document.getElementById('users-list');
    container.innerHTML = '<p class="loading"><span class="spinner"></span></p>';

    try {
      const response = await fetch('/api/plugins/coinbattle/players?limit=100');
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        container.innerHTML = renderUsersManagementTable(result.data);
      } else {
        container.innerHTML = '<p class="loading">No users found</p>';
      }
    } catch (error) {
      container.innerHTML = '<p class="loading">Error loading users</p>';
    }
  }

  /**
   * Render users management table
   */
  function renderUsersManagementTable(users) {
    let html = `
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>Nickname</th>
            <th>Total Coins</th>
            <th>Matches</th>
            <th>Wins</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    users.forEach(user => {
      html += `
        <tr>
          <td>
            <div class="player-info">
              <div class="player-name">${escapeHtml(user.nickname)}</div>
            </div>
          </td>
          <td>${user.total_coins || 0}</td>
          <td>${user.matches_played || 0}</td>
          <td>${user.matches_won || 0}</td>
          <td>
            <button class="btn btn-sm btn-danger delete-user-btn" 
                    data-user-id="${escapeHtml(user.user_id)}" 
                    data-nickname="${escapeHtml(user.nickname)}">
              🗑️ Delete
            </button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    return html;
  }

  /**
   * Delete user from leaderboards
   */
  async function deleteUser(userId, nickname) {
    // Use textContent to safely display nickname (confirm uses plain text, not HTML)
    const safeNickname = nickname || userId;
    if (!confirm(`Are you sure you want to delete "${safeNickname}" from all leaderboards? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/plugins/coinbattle/players/${userId}`, {
        method: 'DELETE'
      });
      const result = await response.json();

      if (result.success) {
        showNotification(`User "${safeNickname}" deleted successfully`, 'success');
        loadUsersForManagement(); // Reload the list
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification('Error deleting user', 'danger');
    }
  }

  /**
   * Load current season info
   */
  async function loadSeasonInfo() {
    const container = document.getElementById('current-season-info');
    
    try {
      const response = await fetch('/api/plugins/coinbattle/season/active');
      const result = await response.json();

      if (result.success && result.data) {
        const season = result.data;
        const startDate = new Date(season.start_date * 1000).toLocaleDateString();
        const endDate = new Date(season.end_date * 1000).toLocaleDateString();
        
        container.innerHTML = `
          <div class="alert alert-success">
            <strong>Active Season:</strong> ${escapeHtml(season.season_name)}<br>
            <strong>Period:</strong> ${startDate} - ${endDate}
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="alert alert-warning">
            No active season configured
          </div>
        `;
      }
    } catch (error) {
      container.innerHTML = `
        <div class="alert alert-danger">
          Error loading season info
        </div>
      `;
    }
  }

  /**
   * Save season configuration
   */
  async function saveSeason() {
    const seasonName = document.getElementById('season-name').value;
    const startDateInput = document.getElementById('season-start-date').value;
    const endDateInput = document.getElementById('season-end-date').value;

    if (!seasonName || !startDateInput || !endDateInput) {
      showNotification('Please fill in all season fields', 'warning');
      return;
    }

    const startDate = Math.floor(new Date(startDateInput).getTime() / 1000);
    const endDate = Math.floor(new Date(endDateInput).getTime() / 1000);

    if (startDate >= endDate) {
      showNotification('End date must be after start date', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/plugins/coinbattle/season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonName, startDate, endDate })
      });
      const result = await response.json();

      if (result.success) {
        showNotification('Season saved successfully', 'success');
        loadSeasonInfo();
        
        // Clear form
        document.getElementById('season-name').value = '';
        document.getElementById('season-start-date').value = '';
        document.getElementById('season-end-date').value = '';
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification('Error saving season', 'danger');
    }
  }

})();
