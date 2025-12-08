const socket = io();

// Load overall stats
async function loadStats() {
  try {
    const response = await fetch('/api/viewer-xp/stats');
    const stats = await response.json();
    
    document.getElementById('totalViewers').textContent = stats.totalViewers.toLocaleString();
    document.getElementById('totalXP').textContent = stats.totalXPEarned.toLocaleString();
    document.getElementById('avgLevel').textContent = stats.avgLevel.toFixed(1);
    document.getElementById('activeToday').textContent = stats.activeToday.toLocaleString();
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load leaderboard
async function loadLeaderboard() {
  const filter = document.getElementById('leaderboardFilter').value;
  const days = filter ? parseInt(filter) : null;
  
  try {
    let url = '/api/viewer-xp/leaderboard?limit=50';
    if (days) url += `&days=${days}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    const tbody = document.getElementById('leaderboardTable');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No viewers yet</td></tr>';
      return;
    }
    
    data.forEach((viewer, index) => {
      const xpValue = days ? viewer.xp_period : viewer.xp;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td style="color: ${viewer.name_color || '#fff'}">${viewer.username}</td>
        <td><span class="badge level-badge">Level ${viewer.level}</span></td>
        <td>${viewer.title || '-'}</td>
        <td>${xpValue.toLocaleString()} XP</td>
        <td>
          <div class="xp-bar-mini">
            <div class="xp-bar-fill" style="width: 75%"></div>
          </div>
        </td>
        <td>
          <button class="btn btn-sm btn-primary action-btn" data-action="viewDetails" data-username="${viewer.username}">
            Details
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    // Setup event delegation for dynamically created buttons
    setupLeaderboardEventListeners();
  } catch (error) {
    console.error('Error loading leaderboard:', error);
  }
}

// Setup event listeners for leaderboard buttons
function setupLeaderboardEventListeners() {
  const tbody = document.getElementById('leaderboardTable');
  
  // Remove existing listener if any (to prevent duplicates)
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);
  
  // Add event delegation
  document.getElementById('leaderboardTable').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action="viewDetails"]');
    if (button) {
      const username = button.getAttribute('data-username');
      viewDetails(username);
    }
  });
}

// Load XP actions
async function loadActions() {
  try {
    const response = await fetch('/api/viewer-xp/actions');
    const actions = await response.json();
    
    const tbody = document.getElementById('actionsTable');
    tbody.innerHTML = '';
    
    actions.forEach(action => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${action.action_type}</td>
        <td>
          <input type="number" class="form-control form-control-sm" 
            value="${action.xp_amount}" 
            data-action="${action.action_type}" 
            data-field="xp_amount">
        </td>
        <td>
          <input type="number" class="form-control form-control-sm" 
            value="${action.cooldown_seconds}" 
            data-action="${action.action_type}" 
            data-field="cooldown_seconds">
        </td>
        <td>
          <input type="checkbox" class="form-check-input" 
            ${action.enabled ? 'checked' : ''} 
            data-action="${action.action_type}" 
            data-field="enabled">
        </td>
        <td>
          <button class="btn btn-sm btn-success" data-action-type="${action.action_type}" data-save-action="true">
            Save
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    // Setup event delegation for action buttons
    setupActionsEventListeners();
  } catch (error) {
    console.error('Error loading actions:', error);
  }
}

// Setup event listeners for action table buttons
function setupActionsEventListeners() {
  const tbody = document.getElementById('actionsTable');
  
  // Remove existing listener if any
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);
  
  // Add event delegation
  document.getElementById('actionsTable').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-save-action="true"]');
    if (button) {
      const actionType = button.getAttribute('data-action-type');
      updateAction(actionType);
    }
  });
}

// Load general settings
async function loadGeneralSettings() {
  try {
    const response = await fetch('/api/viewer-xp/settings');
    const settings = await response.json();
    
    document.getElementById('enableDailyBonus').checked = settings.enableDailyBonus;
    document.getElementById('enableStreaks').checked = settings.enableStreaks;
    document.getElementById('enableWatchTime').checked = settings.enableWatchTime;
    document.getElementById('watchTimeInterval').value = settings.watchTimeInterval;
    document.getElementById('announceLevelUps').checked = settings.announceLevel;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Update action
async function updateAction(actionType) {
  const xpInput = document.querySelector(`input[data-action="${actionType}"][data-field="xp_amount"]`);
  const cooldownInput = document.querySelector(`input[data-action="${actionType}"][data-field="cooldown_seconds"]`);
  const enabledInput = document.querySelector(`input[data-action="${actionType}"][data-field="enabled"]`);
  
  try {
    await fetch(`/api/viewer-xp/actions/${actionType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xp_amount: parseInt(xpInput.value),
        cooldown_seconds: parseInt(cooldownInput.value),
        enabled: enabledInput.checked
      })
    });
    
    alert('Action updated successfully!');
  } catch (error) {
    console.error('Error updating action:', error);
    alert('Error updating action');
  }
}

// View viewer details
async function viewDetails(username) {
  const modal = new bootstrap.Modal(document.getElementById('viewerModal'));
  const body = document.getElementById('viewerModalBody');
  body.innerHTML = 'Loading...';
  modal.show();
  
  try {
    const response = await fetch(`/api/viewer-xp/stats/${username}`);
    const stats = await response.json();
    
    let html = `
      <h5>${stats.profile.username}</h5>
      <p><strong>Level:</strong> ${stats.profile.level} | <strong>Title:</strong> ${stats.profile.title || 'None'}</p>
      <p><strong>XP:</strong> ${stats.profile.xp.toLocaleString()} | <strong>Total Earned:</strong> ${stats.profile.total_xp_earned.toLocaleString()}</p>
      <p><strong>Streak:</strong> ${stats.profile.streak_days || 0} days</p>
      <p><strong>First Seen:</strong> ${new Date(stats.profile.first_seen).toLocaleString()}</p>
      <p><strong>Last Seen:</strong> ${new Date(stats.profile.last_seen).toLocaleString()}</p>
      
      <h6 class="mt-3">XP Breakdown</h6>
      <table class="table table-dark table-sm">
        <thead><tr><th>Action</th><th>Count</th><th>Total XP</th></tr></thead>
        <tbody>
    `;
    
    stats.actions.forEach(action => {
      html += `<tr><td>${action.action_type}</td><td>${action.count}</td><td>${action.total_xp}</td></tr>`;
    });
    
    html += '</tbody></table>';
    body.innerHTML = html;
  } catch (error) {
    console.error('Error loading viewer details:', error);
    body.innerHTML = 'Error loading details';
  }
}

// Event listeners
document.getElementById('leaderboardFilter').addEventListener('change', loadLeaderboard);

document.getElementById('generalSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    await fetch('/api/viewer-xp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enableDailyBonus: document.getElementById('enableDailyBonus').checked,
        enableStreaks: document.getElementById('enableStreaks').checked,
        enableWatchTime: document.getElementById('enableWatchTime').checked,
        watchTimeInterval: parseInt(document.getElementById('watchTimeInterval').value),
        announceLevelUps: document.getElementById('announceLevelUps').checked
      })
    });
    
    alert('Settings saved successfully!');
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Error saving settings');
  }
});

document.getElementById('manualAwardForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    await fetch('/api/viewer-xp/award', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('awardUsername').value,
        amount: parseInt(document.getElementById('awardAmount').value),
        reason: document.getElementById('awardReason').value
      })
    });
    
    alert('XP awarded successfully!');
    document.getElementById('manualAwardForm').reset();
    loadStats();
    loadLeaderboard();
  } catch (error) {
    console.error('Error awarding XP:', error);
    alert('Error awarding XP');
  }
});

// Tab change handlers
document.getElementById('settings-tab').addEventListener('shown.bs.tab', () => {
  loadActions();
  loadGeneralSettings();
});

document.getElementById('level-config-tab').addEventListener('shown.bs.tab', () => {
  loadLevelConfig();
});

// Level Configuration Functions
let currentLevelConfigs = [];

async function loadLevelConfig() {
  try {
    const response = await fetch('/api/viewer-xp/settings');
    const settings = await response.json();
    
    const levelType = settings.levelType || 'exponential';
    document.getElementById('levelType').value = levelType;
    handleLevelTypeChange(levelType);
    
    // Load saved values
    if (settings.xpPerLevel) document.getElementById('xpPerLevel').value = settings.xpPerLevel;
    if (settings.baseXP) document.getElementById('baseXP').value = settings.baseXP;
    if (settings.logMultiplier) document.getElementById('logMultiplier').value = settings.logMultiplier;
    if (settings.maxLevel) document.getElementById('maxLevel').value = settings.maxLevel;
    
    // Load custom level configs if custom type
    if (levelType === 'custom') {
      const configResponse = await fetch('/api/viewer-xp/level-config');
      const configs = await configResponse.json();
      displayCustomLevelConfigs(configs);
    }
  } catch (error) {
    console.error('Error loading level config:', error);
  }
}

function handleLevelTypeChange(type) {
  // Hide all type-specific settings
  document.getElementById('linearSettings').style.display = 'none';
  document.getElementById('exponentialSettings').style.display = 'none';
  document.getElementById('logarithmicSettings').style.display = 'none';
  document.getElementById('customLevelCard').style.display = 'none';
  
  // Show relevant settings
  if (type === 'linear') {
    document.getElementById('linearSettings').style.display = 'block';
  } else if (type === 'exponential') {
    document.getElementById('exponentialSettings').style.display = 'block';
  } else if (type === 'logarithmic') {
    document.getElementById('logarithmicSettings').style.display = 'block';
  } else if (type === 'custom') {
    document.getElementById('customLevelCard').style.display = 'block';
  }
}

document.getElementById('levelType').addEventListener('change', (e) => {
  handleLevelTypeChange(e.target.value);
});

document.getElementById('generateLevels').addEventListener('click', async () => {
  const levelType = document.getElementById('levelType').value;
  const maxLevel = parseInt(document.getElementById('maxLevel').value);
  
  const settings = { maxLevel };
  
  if (levelType === 'linear') {
    settings.xpPerLevel = parseInt(document.getElementById('xpPerLevel').value);
  } else if (levelType === 'exponential') {
    settings.baseXP = parseInt(document.getElementById('baseXP').value);
  } else if (levelType === 'logarithmic') {
    settings.multiplier = parseInt(document.getElementById('logMultiplier').value);
  }
  
  try {
    const response = await fetch('/api/viewer-xp/level-config/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: levelType, settings })
    });
    
    currentLevelConfigs = await response.json();
    
    if (levelType === 'custom') {
      displayCustomLevelConfigs(currentLevelConfigs);
    }
    
    displayLevelPreview(currentLevelConfigs);
  } catch (error) {
    console.error('Error generating levels:', error);
    alert('Error generating level configuration');
  }
});

document.getElementById('applyLevelConfig').addEventListener('click', async () => {
  if (currentLevelConfigs.length === 0) {
    alert('Please generate a level configuration first');
    return;
  }
  
  const levelType = document.getElementById('levelType').value;
  
  try {
    // Save level type and related settings
    const settings = {
      levelType,
      maxLevel: parseInt(document.getElementById('maxLevel').value)
    };
    
    if (levelType === 'linear') {
      settings.xpPerLevel = parseInt(document.getElementById('xpPerLevel').value);
    } else if (levelType === 'exponential') {
      settings.baseXP = parseInt(document.getElementById('baseXP').value);
    } else if (levelType === 'logarithmic') {
      settings.logMultiplier = parseInt(document.getElementById('logMultiplier').value);
    }
    
    await fetch('/api/viewer-xp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    
    // Save custom level configs if custom type
    if (levelType === 'custom') {
      await fetch('/api/viewer-xp/level-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: currentLevelConfigs })
      });
    }
    
    alert('Level configuration applied successfully! Viewer levels will be recalculated on next XP award.');
    loadStats();
  } catch (error) {
    console.error('Error applying level config:', error);
    alert('Error applying configuration');
  }
});

function displayCustomLevelConfigs(configs) {
  const tbody = document.getElementById('customLevelsTable');
  tbody.innerHTML = '';
  
  configs.forEach(config => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${config.level}</td>
      <td>
        <input type="number" class="form-control form-control-sm" 
          value="${config.xp_required}" 
          data-level="${config.level}" 
          data-field="xp_required">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm" 
          value="${config.custom_title || ''}" 
          data-level="${config.level}" 
          data-field="custom_title">
      </td>
      <td>
        <input type="color" class="form-control form-control-sm" 
          value="${config.custom_color || '#FFFFFF'}" 
          data-level="${config.level}" 
          data-field="custom_color">
      </td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removeLevel(${config.level})">Remove</button>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  // Update currentLevelConfigs when inputs change
  tbody.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      const level = parseInt(input.getAttribute('data-level'));
      const field = input.getAttribute('data-field');
      const config = currentLevelConfigs.find(c => c.level === level);
      if (config) {
        if (field === 'xp_required') {
          config.xp_required = parseInt(input.value);
        } else {
          config[field] = input.value;
        }
      }
    });
  });
}

function displayLevelPreview(configs) {
  const tbody = document.getElementById('levelPreviewTable');
  tbody.innerHTML = '';
  
  const displayConfigs = configs.slice(0, 20); // Show first 20 levels
  
  displayConfigs.forEach((config, index) => {
    const prevXP = index > 0 ? configs[index - 1].xp_required : 0;
    const diff = config.xp_required - prevXP;
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>Level ${config.level}</td>
      <td>${config.xp_required.toLocaleString()} XP</td>
      <td>+${diff.toLocaleString()} XP</td>
      <td>
        <div class="xp-bar-mini">
          <div class="xp-bar-fill" style="width: ${(config.level / configs.length) * 100}%"></div>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  if (configs.length > 20) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="4" class="text-center">... and ${configs.length - 20} more levels</td>`;
    tbody.appendChild(row);
  }
}

document.getElementById('addLevelRow').addEventListener('click', () => {
  const maxLevel = currentLevelConfigs.length > 0 
    ? Math.max(...currentLevelConfigs.map(c => c.level)) + 1 
    : 1;
  
  const lastXP = currentLevelConfigs.length > 0
    ? currentLevelConfigs[currentLevelConfigs.length - 1].xp_required
    : 0;
  
  currentLevelConfigs.push({
    level: maxLevel,
    xp_required: lastXP + 1000
  });
  
  displayCustomLevelConfigs(currentLevelConfigs);
  displayLevelPreview(currentLevelConfigs);
});

function removeLevel(level) {
  currentLevelConfigs = currentLevelConfigs.filter(c => c.level !== level);
  displayCustomLevelConfigs(currentLevelConfigs);
  displayLevelPreview(currentLevelConfigs);
}

// Import/Export Functions
document.getElementById('exportDataBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('exportStatus');
  statusEl.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Exporting...';
  
  try {
    const response = await fetch('/api/viewer-xp/export');
    const data = await response.json();
    
    // Create download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viewer-xp-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    statusEl.innerHTML = '<div class="alert alert-success">Export completed successfully!</div>';
  } catch (error) {
    console.error('Error exporting data:', error);
    statusEl.innerHTML = '<div class="alert alert-danger">Error exporting data</div>';
  }
});

document.getElementById('importDataBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('importFile');
  const statusEl = document.getElementById('importStatus');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a file to import');
    return;
  }
  
  statusEl.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Importing...';
  
  try {
    const file = fileInput.files[0];
    const text = await file.text();
    const data = JSON.parse(text);
    
    const response = await fetch('/api/viewer-xp/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      statusEl.innerHTML = '<div class="alert alert-success">Import completed successfully!</div>';
      loadStats();
      loadLeaderboard();
    } else {
      statusEl.innerHTML = '<div class="alert alert-danger">Error importing data</div>';
    }
  } catch (error) {
    console.error('Error importing data:', error);
    statusEl.innerHTML = '<div class="alert alert-danger">Error importing data: ' + error.message + '</div>';
  }
});

document.getElementById('loadHistoryBtn').addEventListener('click', async () => {
  const username = document.getElementById('historyUsername').value;
  
  if (!username) {
    alert('Please enter a username');
    return;
  }
  
  try {
    const response = await fetch(`/api/viewer-xp/history/${username}?limit=100`);
    const history = await response.json();
    
    const container = document.getElementById('historyContainer');
    const tbody = document.getElementById('historyTable');
    
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">No history found for this user</td></tr>';
      container.style.display = 'block';
      return;
    }
    
    tbody.innerHTML = '';
    history.forEach(entry => {
      const details = entry.details ? JSON.parse(entry.details) : {};
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(entry.timestamp).toLocaleString()}</td>
        <td><span class="badge bg-primary">${entry.action_type}</span></td>
        <td>+${entry.amount} XP</td>
        <td>${details.reason || details.message || '-'}</td>
      `;
      tbody.appendChild(row);
    });
    
    container.style.display = 'block';
  } catch (error) {
    console.error('Error loading history:', error);
    alert('Error loading viewer history');
  }
});

// Initial load
loadStats();
loadLeaderboard();

// Auto-refresh stats
setInterval(loadStats, 30000);

// Listen for XP updates
socket.on('viewer-xp:update', () => {
  loadStats();
});

socket.on('viewer-xp:level-up', () => {
  loadLeaderboard();
});
