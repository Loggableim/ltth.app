const socket = io();
let config = null;
let stats = null;
let tiers = [];
let users = [];
let currentEditingTier = null;

// Load configuration on page load
async function loadConfig() {
    try {
        const response = await fetch('/api/gift-milestone/config');
        const data = await response.json();
        if (data.success) {
            config = data.config;
            populateForm(config);
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showNotification('Fehler beim Laden der Konfiguration', 'error');
    }
}

// Load tiers
async function loadTiers() {
    try {
        const response = await fetch('/api/gift-milestone/tiers');
        const data = await response.json();
        if (data.success) {
            tiers = data.tiers;
            displayTiers();
        }
    } catch (error) {
        console.error('Error loading tiers:', error);
    }
}

// Load user statistics
async function loadUsers() {
    try {
        const response = await fetch('/api/gift-milestone/users');
        const data = await response.json();
        if (data.success) {
            users = data.users;
            displayUsers();
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Display tiers
function displayTiers() {
    const tiersList = document.getElementById('tiersList');
    
    if (!tiers || tiers.length === 0) {
        tiersList.innerHTML = '<div class="empty-state">📭 Noch keine Stufen definiert. Klicke auf "Neue Stufe hinzufügen" um loszulegen.</div>';
        return;
    }
    
    tiersList.innerHTML = tiers.map(tier => `
        <div class="tier-item">
            <div class="tier-info">
                <div class="tier-name">
                    ${tier.name}
                    <span class="tier-level-badge">Level ${tier.tier_level}</span>
                    ${!tier.enabled ? '<span style="opacity: 0.5">(Deaktiviert)</span>' : ''}
                </div>
                <div class="tier-threshold">
                    💰 ${tier.threshold.toLocaleString()} Coins
                    ${tier.animation_gif_path || tier.animation_video_path || tier.animation_audio_path ? '| 🎬 Benutzerdefinierte Medien' : ''}
                </div>
            </div>
            <div class="tier-actions">
                <button class="small-button test-tier-btn" data-tier-id="${tier.id}">🧪 Test</button>
                <button class="small-button edit-btn" data-tier-id="${tier.id}">✏️ Bearbeiten</button>
                <button class="small-button delete-btn" data-tier-id="${tier.id}">🗑️ Löschen</button>
            </div>
        </div>
    `).join('');
}

// Display users
function displayUsers() {
    const userStatsList = document.getElementById('userStatsList');
    
    if (!users || users.length === 0) {
        userStatsList.innerHTML = '<div class="empty-state">📭 Noch keine Benutzer-Statistiken vorhanden.</div>';
        return;
    }
    
    // Get tier names for display
    const tierMap = {};
    tiers.forEach(tier => {
        tierMap[tier.tier_level] = tier.name;
    });
    
    userStatsList.innerHTML = users.map(user => {
        const tierName = tierMap[user.last_tier_reached] || 'Keine Stufe';
        return `
        <div class="user-item">
            <div class="user-info">
                <div class="user-name">
                    ${user.username || user.user_id}
                    ${user.last_tier_reached > 0 ? `<span class="user-tier-badge">${tierName}</span>` : ''}
                </div>
                <div class="user-coins">
                    💰 ${user.cumulative_coins.toLocaleString()} Coins gesamt
                    ${user.last_trigger_at ? `| Letzter Meilenstein: ${new Date(user.last_trigger_at).toLocaleString('de-DE')}` : ''}
                </div>
            </div>
            <div class="user-actions">
                <button class="small-button delete-btn delete-user-btn" data-user-id="${user.user_id}">🗑️ Zurücksetzen</button>
            </div>
        </div>
    `;
    }).join('');
}

// Add tier
function addTier() {
    currentEditingTier = null; // Clear any previous editing state
    document.getElementById('tierModalTitle').textContent = 'Neue Stufe hinzufügen';
    document.getElementById('tierName').value = '';
    document.getElementById('tierLevel').value = tiers.length + 1;
    document.getElementById('tierThreshold').value = 1000;
    document.getElementById('tierEnabled').checked = true;
    document.getElementById('tierGifPreview').style.display = 'none';
    document.getElementById('tierVideoPreview').style.display = 'none';
    document.getElementById('tierAudioPreview').style.display = 'none';
    document.getElementById('tierModal').classList.add('active');
}

// Edit tier
function editTier(tierId) {
    const tier = tiers.find(t => t.id === tierId);
    if (!tier) return;
    
    currentEditingTier = tier;
    document.getElementById('tierModalTitle').textContent = 'Stufe bearbeiten';
    document.getElementById('tierName').value = tier.name;
    document.getElementById('tierLevel').value = tier.tier_level;
    document.getElementById('tierThreshold').value = tier.threshold;
    document.getElementById('tierEnabled').checked = tier.enabled;
    
    if (tier.animation_gif_path) {
        document.getElementById('tierGifPreview').textContent = `✅ ${tier.animation_gif_path.split('/').pop()}`;
        document.getElementById('tierGifPreview').style.display = 'block';
    } else {
        document.getElementById('tierGifPreview').style.display = 'none';
    }
    
    if (tier.animation_video_path) {
        document.getElementById('tierVideoPreview').textContent = `✅ ${tier.animation_video_path.split('/').pop()}`;
        document.getElementById('tierVideoPreview').style.display = 'block';
    } else {
        document.getElementById('tierVideoPreview').style.display = 'none';
    }
    
    if (tier.animation_audio_path) {
        document.getElementById('tierAudioPreview').textContent = `✅ ${tier.animation_audio_path.split('/').pop()}`;
        document.getElementById('tierAudioPreview').style.display = 'block';
    } else {
        document.getElementById('tierAudioPreview').style.display = 'none';
    }
    
    document.getElementById('tierModal').classList.add('active');
}

// Save tier
async function saveTier() {
    const tierData = {
        name: document.getElementById('tierName').value,
        tier_level: parseInt(document.getElementById('tierLevel').value),
        threshold: parseInt(document.getElementById('tierThreshold').value),
        enabled: document.getElementById('tierEnabled').checked ? 1 : 0
    };
    
    if (!tierData.name) {
        showNotification('Bitte gib einen Namen ein', 'error');
        return;
    }
    
    if (tierData.threshold < 100) {
        showNotification('Schwellenwert muss mindestens 100 sein', 'error');
        return;
    }
    
    // If editing, include the ID and existing media paths
    if (currentEditingTier) {
        tierData.id = currentEditingTier.id;
        tierData.animation_gif_path = currentEditingTier.animation_gif_path;
        tierData.animation_video_path = currentEditingTier.animation_video_path;
        tierData.animation_audio_path = currentEditingTier.animation_audio_path;
    }
    
    try {
        const response = await fetch('/api/gift-milestone/tiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tierData)
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Stufe gespeichert!');
            document.getElementById('tierModal').classList.remove('active');
            currentEditingTier = null; // Clear editing state
            loadTiers();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving tier:', error);
        showNotification('Fehler beim Speichern', 'error');
    }
}

// Auto-save tier when needed for media upload (for new tiers)
async function autoSaveTierForUpload() {
    // If already editing an existing tier, no need to auto-save
    if (currentEditingTier && currentEditingTier.id) {
        return true;
    }
    
    // Validate and save tier first
    const tierData = {
        name: document.getElementById('tierName').value,
        tier_level: parseInt(document.getElementById('tierLevel').value),
        threshold: parseInt(document.getElementById('tierThreshold').value),
        enabled: document.getElementById('tierEnabled').checked ? 1 : 0
    };
    
    if (!tierData.name) {
        showNotification('Bitte gib zuerst einen Stufen-Namen ein', 'error');
        return false;
    }
    
    if (tierData.threshold < 100) {
        showNotification('Schwellenwert muss mindestens 100 sein', 'error');
        return false;
    }
    
    try {
        const response = await fetch('/api/gift-milestone/tiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tierData)
        });
        const data = await response.json();
        if (data.success) {
            // Set current editing tier with the new ID
            currentEditingTier = {
                id: data.tierId,
                name: tierData.name,
                tier_level: tierData.tier_level,
                threshold: tierData.threshold,
                enabled: tierData.enabled
            };
            showNotification('Stufe automatisch gespeichert für Medien-Upload');
            return true;
        } else {
            showNotification(data.error, 'error');
            return false;
        }
    } catch (error) {
        console.error('Error auto-saving tier:', error);
        showNotification('Fehler beim automatischen Speichern', 'error');
        return false;
    }
}

// Delete tier
async function deleteTier(tierId) {
    if (!confirm('Diese Stufe wirklich löschen?')) return;
    
    try {
        const response = await fetch(`/api/gift-milestone/tiers/${tierId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Stufe gelöscht!');
            loadTiers();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting tier:', error);
        showNotification('Fehler beim Löschen', 'error');
    }
}

// Test tier
async function testTier(tierId) {
    try {
        const response = await fetch('/api/gift-milestone/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tierId })
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Test-Celebration für diese Stufe ausgelöst!');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error testing tier:', error);
        showNotification('Fehler beim Testen', 'error');
    }
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Statistiken für diesen Benutzer wirklich zurücksetzen?')) return;
    
    try {
        const response = await fetch(`/api/gift-milestone/users/${userId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Benutzer-Statistiken zurückgesetzt!');
            loadUsers();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('Fehler beim Zurücksetzen', 'error');
    }
}

// Delete all users
async function deleteAllUsers() {
    if (!confirm('ALLE Benutzer-Statistiken wirklich zurücksetzen? Dies kann nicht rückgängig gemacht werden!')) return;
    
    try {
        const response = await fetch('/api/gift-milestone/users/reset', {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Alle Benutzer-Statistiken zurückgesetzt!');
            loadUsers();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error resetting all users:', error);
        showNotification('Fehler beim Zurücksetzen', 'error');
    }
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch('/api/gift-milestone/stats');
        const data = await response.json();
        if (data.success) {
            stats = data.stats;
            config = data.config;
            // Stats are now per-user, so we don't need global stats display
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Populate form with config data
function populateForm(config) {
    if (!config) {
        console.warn('Config is missing');
        return;
    }

    document.getElementById('enableToggle').checked = config.enabled || false;
    document.getElementById('statusText').textContent = config.enabled ? 'Aktiviert' : 'Deaktiviert';
    
    // Only visible fields
    document.getElementById('playbackMode').value = config.playback_mode || 'exclusive';
    document.getElementById('audioVolume').value = config.audio_volume || 80;
    document.getElementById('animationDuration').value = config.animation_duration || 0;
    
    // Hidden legacy fields for backward compatibility - always use default values
    document.getElementById('threshold').value = config.threshold || 1000;
    document.getElementById('incrementStep').value = config.increment_step || 1000;
    document.getElementById('mode').value = config.mode || 'auto_increment';
    // Session reset is deprecated for per-user tracking, always set to false
    document.getElementById('sessionReset').value = '0';

    // Update file previews
    updateFilePreview('gif', config.animation_gif_path);
    updateFilePreview('video', config.animation_video_path);
    updateFilePreview('audio', config.animation_audio_path);
}

// Update file preview
function updateFilePreview(type, path) {
    const preview = document.getElementById(`${type}Preview`);
    const deleteBtn = document.getElementById(`delete${type.charAt(0).toUpperCase() + type.slice(1)}`);

    if (path) {
        preview.textContent = `✅ ${path.split('/').pop()}`;
        preview.style.display = 'block';
        deleteBtn.style.display = 'inline-block';
    } else {
        preview.style.display = 'none';
        deleteBtn.style.display = 'none';
    }
}

// Toggle enable/disable
document.getElementById('enableToggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
        const response = await fetch('/api/gift-milestone/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('statusText').textContent = enabled ? 'Aktiviert' : 'Deaktiviert';
            showNotification(data.message);
        }
    } catch (error) {
        console.error('Error toggling milestone:', error);
        showNotification('Fehler beim Umschalten', 'error');
    }
});

// File upload handlers
['gif', 'video', 'audio'].forEach(type => {
    document.getElementById(`${type}Input`).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append(type, file);

        try {
            const response = await fetch(`/api/gift-milestone/upload/${type}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                updateFilePreview(type, data.url);
                showNotification(`${type.toUpperCase()} erfolgreich hochgeladen`);
            } else {
                showNotification(data.error, 'error');
            }
        } catch (error) {
            console.error(`Error uploading ${type}:`, error);
            showNotification(`Fehler beim Hochladen von ${type}`, 'error');
        }

        e.target.value = '';
    });

    // Delete handlers
    document.getElementById(`delete${type.charAt(0).toUpperCase() + type.slice(1)}`).addEventListener('click', async () => {
        if (!confirm(`${type.toUpperCase()} wirklich löschen?`)) return;

        try {
            const response = await fetch(`/api/gift-milestone/media/${type}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                updateFilePreview(type, null);
                showNotification(`${type.toUpperCase()} gelöscht`);
            }
        } catch (error) {
            console.error(`Error deleting ${type}:`, error);
            showNotification(`Fehler beim Löschen von ${type}`, 'error');
        }
    });
});

// Save configuration
document.getElementById('saveButton').addEventListener('click', async () => {
    const config = {
        enabled: document.getElementById('enableToggle').checked,
        playback_mode: document.getElementById('playbackMode').value,
        audio_volume: parseInt(document.getElementById('audioVolume').value),
        animation_duration: parseInt(document.getElementById('animationDuration').value),
        // Hidden legacy fields - use defaults to maintain compatibility
        threshold: parseInt(document.getElementById('threshold').value) || 1000,
        increment_step: parseInt(document.getElementById('incrementStep').value) || 1000,
        mode: document.getElementById('mode').value || 'auto_increment',
        // Session reset is deprecated for per-user tracking, always false
        session_reset: false
    };

    try {
        const response = await fetch('/api/gift-milestone/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Konfiguration gespeichert!');
            loadStats();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showNotification('Fehler beim Speichern', 'error');
    }
});

// Test button
document.getElementById('testButton').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/gift-milestone/test', {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Test-Celebration ausgelöst!');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error testing milestone:', error);
        showNotification('Fehler beim Testen', 'error');
    }
});

// Socket.io listeners for real-time updates
socket.on('milestone:stats-update', (data) => {
    loadStats();
});

socket.on('milestone:user-stats-update', (data) => {
    loadUsers();
});

socket.on('milestone:config-update', (data) => {
    loadConfig();
});

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification ' + type;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Initialize
// Set up event listeners for file upload buttons
document.getElementById('select-gif-btn').addEventListener('click', () => {
    document.getElementById('gifInput').click();
});
document.getElementById('select-video-btn').addEventListener('click', () => {
    document.getElementById('videoInput').click();
});
document.getElementById('select-audio-btn').addEventListener('click', () => {
    document.getElementById('audioInput').click();
});

// Tier management buttons
document.getElementById('addTierButton').addEventListener('click', addTier);
document.getElementById('saveTierButton').addEventListener('click', saveTier);
document.getElementById('cancelTierButton').addEventListener('click', () => {
    document.getElementById('tierModal').classList.remove('active');
});

// Tier modal file upload buttons
document.getElementById('select-tier-gif-btn').addEventListener('click', () => {
    document.getElementById('tierGifInput').click();
});
document.getElementById('select-tier-video-btn').addEventListener('click', () => {
    document.getElementById('tierVideoInput').click();
});
document.getElementById('select-tier-audio-btn').addEventListener('click', () => {
    document.getElementById('tierAudioInput').click();
});

// Tier modal file upload handlers
const typeMap = { tierGif: 'gif', tierVideo: 'video', tierAudio: 'audio' };
Object.keys(typeMap).forEach(typePrefix => {
    const type = typeMap[typePrefix];
    const inputId = `${typePrefix}Input`;
    const previewId = `${typePrefix}Preview`;
    
    document.getElementById(inputId).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Auto-save tier if it's new (doesn't have an ID yet)
        if (!currentEditingTier || !currentEditingTier.id) {
            const saved = await autoSaveTierForUpload();
            if (!saved) {
                e.target.value = '';
                return;
            }
        }

        const formData = new FormData();
        formData.append(type, file);

        try {
            const response = await fetch(`/api/gift-milestone/tiers/${currentEditingTier.id}/upload/${type}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                // Update preview
                const preview = document.getElementById(previewId);
                preview.textContent = `✅ ${data.filename}`;
                preview.style.display = 'block';
                
                // Update currentEditingTier with new path
                const mediaPathField = `animation_${type}_path`;
                currentEditingTier[mediaPathField] = data.url;
                
                showNotification(`${type.toUpperCase()} für Stufe erfolgreich hochgeladen`);
            } else {
                showNotification(data.error, 'error');
            }
        } catch (error) {
            console.error(`Error uploading tier ${type}:`, error);
            showNotification(`Fehler beim Hochladen von ${type}`, 'error');
        }

        e.target.value = '';
    });
});

// User management buttons
document.getElementById('refreshUsersButton').addEventListener('click', loadUsers);
document.getElementById('resetAllUsersButton').addEventListener('click', deleteAllUsers);

// Close modal when clicking outside
document.getElementById('tierModal').addEventListener('click', (e) => {
    if (e.target.id === 'tierModal') {
        document.getElementById('tierModal').classList.remove('active');
    }
});

// Event delegation for tier action buttons
document.getElementById('tiersList').addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    
    const tierId = button.getAttribute('data-tier-id');
    if (!tierId) return;
    
    if (button.classList.contains('test-tier-btn')) {
        testTier(parseInt(tierId));
    } else if (button.classList.contains('edit-btn')) {
        editTier(parseInt(tierId));
    } else if (button.classList.contains('delete-btn')) {
        deleteTier(parseInt(tierId));
    }
});

// Event delegation for user action buttons
document.getElementById('userStatsList').addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    
    if (button.classList.contains('delete-user-btn')) {
        const userId = button.getAttribute('data-user-id');
        if (userId) {
            deleteUser(userId);
        }
    }
});

loadConfig();
loadStats();
loadTiers();
loadUsers();
setInterval(() => {
    loadStats();
    loadUsers();
}, 5000); // Update stats every 5 seconds
