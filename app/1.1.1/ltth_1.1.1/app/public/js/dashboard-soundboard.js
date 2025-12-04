/**
 * Soundboard UI JavaScript
 * Standalone version for /soundboard/ui page
 */

// Socket connection
const socket = io();

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Audio pool for soundboard playback
let audioPool = [];

// Dedicated preview audio element (reused to prevent multiple simultaneous previews)
let previewAudio = null;
let isPreviewPlaying = false;

// ========== SOCKET EVENTS ==========
socket.on('soundboard:play', (data) => {
    playDashboardSoundboard(data);
});

socket.on('soundboard:preview', (payload) => {
    if (payload.sourceType === 'local') {
        playDashboardSoundboard({
            url: `/sounds/${payload.filename}`,
            volume: 1.0,
            label: 'Preview (Local)'
        });
    } else if (payload.sourceType === 'url') {
        playDashboardSoundboard({
            url: payload.url,
            volume: 1.0,
            label: 'Preview (URL)'
        });
    }
});

// ========== AUDIO PLAYBACK ==========
function playDashboardSoundboard(data) {
    console.log('🔊 [Soundboard] Playing:', data.label);
    
    // Create new audio element
    const audio = document.createElement('audio');
    audio.src = data.url;
    audio.volume = data.volume || 1.0;
    
    // Add to pool
    audioPool.push(audio);
    
    // Play
    audio.play().then(() => {
        console.log('✅ [Soundboard] Started playing:', data.label);
    }).catch(err => {
        console.error('❌ [Soundboard] Playback error:', err);
    });
    
    // Remove after playback
    audio.onended = () => {
        console.log('✅ [Soundboard] Finished:', data.label);
        const index = audioPool.indexOf(audio);
        if (index > -1) {
            audioPool.splice(index, 1);
        }
    };
    
    audio.onerror = (e) => {
        console.error('❌ [Soundboard] Error playing:', data.label, e);
        const index = audioPool.indexOf(audio);
        if (index > -1) {
            audioPool.splice(index, 1);
        }
    };
}

// ========== SETTINGS ==========
async function loadSoundboardSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        
        // Playback settings
        const soundboardEnabled = document.getElementById('soundboard-enabled');
        if (soundboardEnabled) soundboardEnabled.checked = settings.soundboard_enabled === 'true';
        
        const playMode = document.getElementById('soundboard-play-mode');
        if (playMode) playMode.value = settings.soundboard_play_mode || 'overlap';
        
        const maxQueue = document.getElementById('soundboard-max-queue');
        if (maxQueue) maxQueue.value = settings.soundboard_max_queue_length || '10';
        
        // Event sounds
        const followUrl = document.getElementById('soundboard-follow-url');
        if (followUrl) followUrl.value = settings.soundboard_follow_sound || '';
        
        const followVolume = document.getElementById('soundboard-follow-volume');
        if (followVolume) followVolume.value = settings.soundboard_follow_volume || '1.0';
        
        const subscribeUrl = document.getElementById('soundboard-subscribe-url');
        if (subscribeUrl) subscribeUrl.value = settings.soundboard_subscribe_sound || '';
        
        const subscribeVolume = document.getElementById('soundboard-subscribe-volume');
        if (subscribeVolume) subscribeVolume.value = settings.soundboard_subscribe_volume || '1.0';
        
        const shareUrl = document.getElementById('soundboard-share-url');
        if (shareUrl) shareUrl.value = settings.soundboard_share_sound || '';
        
        const shareVolume = document.getElementById('soundboard-share-volume');
        if (shareVolume) shareVolume.value = settings.soundboard_share_volume || '1.0';
        
        const giftUrl = document.getElementById('soundboard-gift-url');
        if (giftUrl) giftUrl.value = settings.soundboard_default_gift_sound || '';
        
        const giftVolume = document.getElementById('soundboard-gift-volume');
        if (giftVolume) giftVolume.value = settings.soundboard_gift_volume || '1.0';
        
        const likeUrl = document.getElementById('soundboard-like-url');
        if (likeUrl) likeUrl.value = settings.soundboard_like_sound || '';
        
        const likeVolume = document.getElementById('soundboard-like-volume');
        if (likeVolume) likeVolume.value = settings.soundboard_like_volume || '1.0';
        
        const likeThreshold = document.getElementById('soundboard-like-threshold');
        if (likeThreshold) likeThreshold.value = settings.soundboard_like_threshold || '0';
        
        const likeWindow = document.getElementById('soundboard-like-window');
        if (likeWindow) likeWindow.value = settings.soundboard_like_window_seconds || '10';
        
    } catch (error) {
        console.error('Error loading soundboard settings:', error);
    }
}

async function saveSoundboardSettings() {
    const soundboardEnabled = document.getElementById('soundboard-enabled');
    const playMode = document.getElementById('soundboard-play-mode');
    const maxQueue = document.getElementById('soundboard-max-queue');
    const followUrl = document.getElementById('soundboard-follow-url');
    const followVolume = document.getElementById('soundboard-follow-volume');
    const subscribeUrl = document.getElementById('soundboard-subscribe-url');
    const subscribeVolume = document.getElementById('soundboard-subscribe-volume');
    const shareUrl = document.getElementById('soundboard-share-url');
    const shareVolume = document.getElementById('soundboard-share-volume');
    const giftUrl = document.getElementById('soundboard-gift-url');
    const giftVolume = document.getElementById('soundboard-gift-volume');
    const likeUrl = document.getElementById('soundboard-like-url');
    const likeVolume = document.getElementById('soundboard-like-volume');
    const likeThreshold = document.getElementById('soundboard-like-threshold');
    const likeWindow = document.getElementById('soundboard-like-window');
    
    const data = {
        soundboard_enabled: soundboardEnabled ? (soundboardEnabled.checked ? 'true' : 'false') : 'false',
        soundboard_play_mode: playMode?.value || 'overlap',
        soundboard_max_queue_length: maxQueue?.value || '10',
        soundboard_follow_sound: followUrl?.value || '',
        soundboard_follow_volume: followVolume?.value || '1.0',
        soundboard_subscribe_sound: subscribeUrl?.value || '',
        soundboard_subscribe_volume: subscribeVolume?.value || '1.0',
        soundboard_share_sound: shareUrl?.value || '',
        soundboard_share_volume: shareVolume?.value || '1.0',
        soundboard_default_gift_sound: giftUrl?.value || '',
        soundboard_gift_volume: giftVolume?.value || '1.0',
        soundboard_like_sound: likeUrl?.value || '',
        soundboard_like_volume: likeVolume?.value || '1.0',
        soundboard_like_threshold: likeThreshold?.value || '0',
        soundboard_like_window_seconds: likeWindow?.value || '10'
    };
    
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('✅ Soundboard settings saved successfully!');
        }
    } catch (error) {
        console.error('Error saving soundboard settings:', error);
        alert('❌ Error saving soundboard settings!');
    }
}

// ========== GIFT SOUNDS ==========
async function loadGiftSounds() {
    try {
        const response = await fetch('/api/soundboard/gifts');
        const gifts = await response.json();
        
        const tbody = document.getElementById('gift-sounds-list');
        if (!tbody) {
            console.warn('gift-sounds-list element not found');
            return;
        }
        tbody.innerHTML = '';
        
        if (gifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-gray-400">No gift sounds configured yet</td></tr>';
            return;
        }
        
        gifts.forEach(gift => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-700';
            
            const animationInfo = gift.animationUrl && gift.animationType !== 'none'
                ? `<span class="text-green-400">${escapeHtml(gift.animationType)}</span>`
                : '<span class="text-gray-500">none</span>';
            
            // Create test button
            const testBtn = document.createElement('button');
            testBtn.className = 'bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700 mr-1';
            testBtn.dataset.action = 'test-sound';
            testBtn.dataset.url = gift.mp3Url;
            testBtn.dataset.volume = gift.volume;
            testBtn.textContent = '🔊 Test';
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-700';
            deleteBtn.dataset.action = 'delete-gift';
            deleteBtn.dataset.giftId = gift.giftId;
            deleteBtn.textContent = '🗑️ Delete';
            
            row.innerHTML = `
                <td class="py-2 pr-4">${gift.giftId}</td>
                <td class="py-2 pr-4 font-semibold">${escapeHtml(gift.label)}</td>
                <td class="py-2 pr-4 text-sm truncate max-w-xs">${escapeHtml(gift.mp3Url)}</td>
                <td class="py-2 pr-4">${gift.volume}</td>
                <td class="py-2 pr-4">${animationInfo}</td>
                <td class="py-2 pr-4">${gift.animationVolume || 1.0}</td>
                <td class="py-2"></td>
            `;
            
            // Append buttons to the last cell
            const actionsCell = row.querySelector('td:last-child');
            actionsCell.appendChild(testBtn);
            actionsCell.appendChild(deleteBtn);
            
            tbody.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading gift sounds:', error);
    }
}

async function addGiftSound() {
    const giftIdEl = document.getElementById('new-gift-id');
    const labelEl = document.getElementById('new-gift-label');
    const urlEl = document.getElementById('new-gift-url');
    
    if (!giftIdEl || !labelEl || !urlEl) {
        console.warn('Gift sound form elements not found');
        return;
    }
    
    const giftId = giftIdEl.value;
    const label = labelEl.value;
    const url = urlEl.value;
    const volume = document.getElementById('new-gift-volume').value;
    const animationUrl = document.getElementById('new-gift-animation-url').value;
    const animationType = document.getElementById('new-gift-animation-type').value;
    const animationVolume = document.getElementById('new-gift-animation-volume').value;
    
    if (!giftId || !label || !url) {
        alert('Please select a gift from the catalog above and enter a sound URL!');
        return;
    }
    
    try {
        const response = await fetch('/api/soundboard/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giftId: parseInt(giftId),
                label: label,
                mp3Url: url,
                volume: parseFloat(volume),
                animationUrl: animationUrl || null,
                animationType: animationType || 'none',
                animationVolume: parseFloat(animationVolume)
            })
        });
        
        const result = await response.json();
        if (result.success) {
            alert('✅ Gift sound added/updated successfully!');
            
            // Clear inputs
            clearGiftSoundForm();
            
            // Reload lists
            await loadGiftSounds();
            await loadGiftCatalog(); // Reload catalog to update checkmarks
        }
    } catch (error) {
        console.error('Error adding gift sound:', error);
        alert('Error adding gift sound!');
    }
}

async function deleteGiftSound(giftId) {
    if (!confirm(`Delete sound for Gift ID ${giftId}?`)) return;
    
    try {
        const response = await fetch(`/api/soundboard/gifts/${giftId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        if (result.success) {
            await loadGiftSounds();
            await loadGiftCatalog(); // Reload catalog to update checkmarks
        }
    } catch (error) {
        console.error('Error deleting gift sound:', error);
    }
}

async function testGiftSound(url, volume) {
    try {
        // Stop any currently playing preview
        if (previewAudio) {
            previewAudio.pause();
            previewAudio.currentTime = 0;
        }
        
        // Create or reuse preview audio element
        if (!previewAudio) {
            previewAudio = document.createElement('audio');
            
            // Add event listeners for preview audio (using addEventListener for proper cleanup)
            previewAudio.addEventListener('ended', () => {
                isPreviewPlaying = false;
            });
            
            previewAudio.addEventListener('error', (e) => {
                isPreviewPlaying = false;
                const errorMsg = previewAudio.error ? `Error code: ${previewAudio.error.code}` : 'Unknown error';
                console.error('Preview playback error:', errorMsg, 'URL:', previewAudio.src);
            });
            
            previewAudio.addEventListener('pause', () => {
                // Track pause state for preview audio
            });
        }
        
        // Set the new source and volume
        previewAudio.src = url;
        previewAudio.volume = parseFloat(volume) || 1.0;
        
        // Load the audio before playing
        previewAudio.load();
        
        // Wait for audio to be ready before playing
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Audio loading timeout'));
            }, 10000); // 10 second timeout
            
            const onCanPlay = () => {
                clearTimeout(timeout);
                resolve();
            };
            
            const onError = () => {
                clearTimeout(timeout);
                const errorMsg = previewAudio.error ? `Error code: ${previewAudio.error.code}` : 'Unknown error';
                reject(new Error(`Failed to load audio: ${errorMsg}`));
            };
            
            // Event listeners with { once: true } automatically clean themselves up
            previewAudio.addEventListener('canplay', onCanPlay, { once: true });
            previewAudio.addEventListener('error', onError, { once: true });
        });
        
        // Play the preview
        isPreviewPlaying = true;
        await previewAudio.play();
        
    } catch (error) {
        isPreviewPlaying = false;
        console.error('Error testing sound:', error);
    }
}

async function testEventSound(eventType) {
    let url, volume;
    
    switch (eventType) {
        case 'follow':
            url = document.getElementById('soundboard-follow-url').value;
            volume = document.getElementById('soundboard-follow-volume').value;
            break;
        case 'subscribe':
            url = document.getElementById('soundboard-subscribe-url').value;
            volume = document.getElementById('soundboard-subscribe-volume').value;
            break;
        case 'share':
            url = document.getElementById('soundboard-share-url').value;
            volume = document.getElementById('soundboard-share-volume').value;
            break;
        case 'gift':
            url = document.getElementById('soundboard-gift-url').value;
            volume = document.getElementById('soundboard-gift-volume').value;
            break;
        case 'like':
            url = document.getElementById('soundboard-like-url').value;
            volume = document.getElementById('soundboard-like-volume').value;
            break;
    }
    
    if (!url) {
        alert('Please enter a sound URL first!');
        return;
    }
    
    // Use the same preview mechanism as testGiftSound
    await testGiftSound(url, volume);
}

function clearGiftSoundForm() {
    document.getElementById('new-gift-id').value = '';
    document.getElementById('new-gift-label').value = '';
    document.getElementById('new-gift-url').value = '';
    document.getElementById('new-gift-volume').value = '1.0';
    document.getElementById('new-gift-animation-url').value = '';
    document.getElementById('new-gift-animation-type').value = 'none';
    document.getElementById('new-gift-animation-volume').value = '1.0';
}

// ========== GIFT CATALOG ==========
async function loadGiftCatalog() {
    try {
        const response = await fetch('/api/gift-catalog');
        const data = await response.json();
        
        const infoDiv = document.getElementById('gift-catalog-info');
        const catalogDiv = document.getElementById('gift-catalog-list');
        
        if (!data.success) {
            infoDiv.innerHTML = '<span class="text-red-400">Error loading gift catalog</span>';
            catalogDiv.innerHTML = '';
            return;
        }
        
        const catalog = data.catalog || [];
        const lastUpdate = data.lastUpdate;
        
        // Info anzeigen
        if (catalog.length === 0) {
            infoDiv.innerHTML = `
                <span class="text-yellow-400">⚠️ No gifts in catalog. Connect to a stream and click "Refresh Catalog"</span>
            `;
            catalogDiv.innerHTML = '';
            return;
        }
        
        const updateText = lastUpdate ? `Last updated: ${new Date(lastUpdate).toLocaleString()}` : 'Never updated';
        infoDiv.innerHTML = `
            <span class="text-green-400">✅ ${catalog.length} gifts available</span>
            <span class="mx-2">•</span>
            <span class="text-gray-400">${updateText}</span>
        `;
        
        // Katalog anzeigen
        catalogDiv.innerHTML = '';
        catalog.forEach(gift => {
            const giftCard = document.createElement('div');
            giftCard.className = 'bg-gray-600 p-3 rounded cursor-pointer hover:bg-gray-500 transition flex flex-col items-center';
            giftCard.onclick = () => selectGift(gift);
            
            const hasSound = isGiftConfigured(gift.id);
            const borderClass = hasSound ? 'border-2 border-green-500' : '';
            
            giftCard.innerHTML = `
                <div class="relative ${borderClass} rounded">
                    ${gift.image_url
                        ? `<img src="${gift.image_url}" alt="${gift.name}" class="w-16 h-16 object-contain rounded">`
                        : `<div class="w-16 h-16 flex items-center justify-center text-3xl">🎁</div>`
                    }
                    ${hasSound ? '<div class="absolute -top-1 -right-1 bg-green-500 rounded-full w-4 h-4 flex items-center justify-center text-xs">✓</div>' : ''}
                </div>
                <div class="text-xs text-center mt-2 font-semibold truncate w-full">${gift.name}</div>
                <div class="text-xs text-gray-400">ID: ${gift.id}</div>
                ${gift.diamond_count ? `<div class="text-xs text-yellow-400">💎 ${gift.diamond_count}</div>` : ''}
            `;
            
            catalogDiv.appendChild(giftCard);
        });
        
    } catch (error) {
        console.error('Error loading gift catalog:', error);
        document.getElementById('gift-catalog-info').innerHTML = '<span class="text-red-400">Error loading catalog</span>';
    }
}

function isGiftConfigured(giftId) {
    // Prüfe ob ein Sound für dieses Gift bereits konfiguriert ist
    const table = document.getElementById('gift-sounds-list');
    if (!table) return false;
    
    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
        const firstCell = row.querySelector('td:first-child');
        if (firstCell && parseInt(firstCell.textContent) === giftId) {
            return true;
        }
    }
    return false;
}

async function refreshGiftCatalog() {
    const btn = document.getElementById('refresh-catalog-btn');
    const icon = document.getElementById('refresh-icon');
    const infoDiv = document.getElementById('gift-catalog-info');
    
    // Button deaktivieren und Animation starten
    btn.disabled = true;
    icon.style.animation = 'spin 1s linear infinite';
    icon.style.display = 'inline-block';
    infoDiv.innerHTML = '<span class="text-blue-400">🔄 Updating gift catalog from stream...</span>';
    
    try {
        const response = await fetch('/api/gift-catalog/update', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            infoDiv.innerHTML = `<span class="text-green-400">✅ ${result.message || 'Catalog updated successfully'}</span>`;
            // Katalog neu laden
            await loadGiftCatalog();
        } else {
            infoDiv.innerHTML = `<span class="text-red-400">❌ ${result.error || 'Failed to update catalog'}</span>`;
        }
    } catch (error) {
        console.error('Error refreshing gift catalog:', error);
        infoDiv.innerHTML = '<span class="text-red-400">❌ Error updating catalog. Make sure you are connected to a stream.</span>';
    } finally {
        btn.disabled = false;
        icon.style.animation = '';
    }
}

function selectGift(gift) {
    // Formular mit Gift-Daten füllen
    document.getElementById('new-gift-id').value = gift.id;
    document.getElementById('new-gift-label').value = gift.name;
    
    // Wenn bereits ein Sound konfiguriert ist, diese Daten laden
    loadExistingGiftSound(gift.id);
    
    // Scroll zum Formular
    document.getElementById('new-gift-url').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('new-gift-url').focus();
}

async function loadExistingGiftSound(giftId) {
    try {
        const response = await fetch('/api/soundboard/gifts');
        const gifts = await response.json();
        
        const existingGift = gifts.find(g => g.giftId === giftId);
        if (existingGift) {
            document.getElementById('new-gift-url').value = existingGift.mp3Url || '';
            document.getElementById('new-gift-volume').value = existingGift.volume || 1.0;
            document.getElementById('new-gift-animation-url').value = existingGift.animationUrl || '';
            document.getElementById('new-gift-animation-type').value = existingGift.animationType || 'none';
            document.getElementById('new-gift-animation-volume').value = existingGift.animationVolume || 1.0;
        }
    } catch (error) {
        console.error('Error loading existing gift sound:', error);
    }
}

// ========== MYINSTANTS SEARCH ==========
async function searchMyInstants() {
    const query = document.getElementById('myinstants-search-input').value;
    
    if (!query) {
        alert('Please enter a search query!');
        return;
    }
    
    const resultsDiv = document.getElementById('myinstants-results');
    resultsDiv.innerHTML = '<div class="text-gray-400 text-sm">🔍 Searching...</div>';
    
    try {
        const response = await fetch(`/api/myinstants/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (!data.success || data.results.length === 0) {
            resultsDiv.innerHTML = '<div class="text-gray-400 text-sm">No results found</div>';
            return;
        }
        
        resultsDiv.innerHTML = '';
        data.results.forEach(sound => {
            const div = document.createElement('div');
            div.className = 'myinstants-result-item';
            
            // Create play button
            const playBtn = document.createElement('button');
            playBtn.className = 'bg-blue-600 px-3 py-2 rounded text-sm hover:bg-blue-700 transition flex items-center gap-2';
            playBtn.title = 'Preview this sound';
            playBtn.dataset.action = 'test-sound';
            playBtn.dataset.url = sound.url;
            playBtn.innerHTML = `
                <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                <span>Play</span>
            `;
            
            // Create use button
            const useBtn = document.createElement('button');
            useBtn.className = 'bg-green-600 px-3 py-2 rounded text-sm hover:bg-green-700 transition flex items-center gap-2';
            useBtn.title = 'Use this sound for selected gift';
            useBtn.dataset.action = 'use-sound';
            useBtn.dataset.name = sound.name;
            useBtn.dataset.url = sound.url;
            useBtn.innerHTML = `
                <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                <span>Use</span>
            `;
            
            // Create result structure
            div.innerHTML = `
                <div class="myinstants-result-info">
                    <div class="myinstants-result-name">${escapeHtml(sound.name)}</div>
                    <div class="myinstants-result-url">${escapeHtml(sound.url)}</div>
                </div>
                <div class="myinstants-result-actions"></div>
            `;
            
            // Append buttons to actions div
            const actionsDiv = div.querySelector('.myinstants-result-actions');
            actionsDiv.appendChild(playBtn);
            actionsDiv.appendChild(useBtn);
            
            resultsDiv.appendChild(div);
        });
        
        // Re-initialize Lucide icons for new elements
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
    } catch (error) {
        console.error('Error searching MyInstants:', error);
        resultsDiv.innerHTML = '<div class="text-red-400 text-sm">Error searching MyInstants</div>';
    }
}

function useMyInstantsSound(name, url) {
    document.getElementById('new-gift-label').value = name;
    document.getElementById('new-gift-url').value = url;
}

// ========== ADVANCED SEARCH ==========
let selectedSoundForBinding = null;
let currentCategory = 'all';
let availableCategories = [];

// Icon mapping for categories
const categoryIcons = {
    'all': 'grid-3x3',
    'memes': 'laugh',
    'meme': 'laugh',
    'games': 'gamepad-2',
    'game': 'gamepad-2',
    'gaming': 'gamepad-2',
    'movies': 'film',
    'movie': 'film',
    'tv': 'film',
    'music': 'music',
    'songs': 'music',
    'song': 'music',
    'animals': 'dog',
    'animal': 'dog',
    'pets': 'dog',
    'sports': 'trophy',
    'sport': 'trophy',
    'politics': 'users',
    'political': 'users',
    'viral': 'trending-up',
    'trending': 'trending-up',
    'funny': 'smile',
    'comedy': 'smile',
    'anime': 'sparkles',
    'cartoons': 'tv',
    'cartoon': 'tv',
    'celebrities': 'star',
    'celebrity': 'star',
    'famous': 'star',
    'default': 'tag'
};

// Get icon for category
function getCategoryIcon(categoryName) {
    const name = categoryName.toLowerCase();
    for (const [key, icon] of Object.entries(categoryIcons)) {
        if (name.includes(key)) {
            return icon;
        }
    }
    return categoryIcons.default;
}

// Load categories from API
async function loadCategories() {
    try {
        const response = await fetch('/api/myinstants/categories');
        const data = await response.json();
        
        if (data.success && data.results && data.results.length > 0) {
            availableCategories = data.results;
            renderCategoryButtons();
        } else {
            console.warn('No categories returned from API, using defaults');
            availableCategories = [
                { name: 'Memes', slug: 'memes' },
                { name: 'Games', slug: 'games' },
                { name: 'Movies', slug: 'movies' },
                { name: 'Music', slug: 'music' },
                { name: 'Animals', slug: 'animals' }
            ];
            renderCategoryButtons();
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        // Use fallback categories
        availableCategories = [
            { name: 'Memes', slug: 'memes' },
            { name: 'Games', slug: 'games' },
            { name: 'Movies', slug: 'movies' },
            { name: 'Music', slug: 'music' },
            { name: 'Animals', slug: 'animals' }
        ];
        renderCategoryButtons();
    }
}

// Render category buttons
function renderCategoryButtons() {
    const container = document.getElementById('category-buttons-container');
    if (!container) return;
    
    // Keep the "All" button, remove the rest
    const allButton = container.querySelector('[data-category="all"]');
    container.innerHTML = '';
    if (allButton) {
        container.appendChild(allButton);
    }
    
    // Add category buttons from API
    availableCategories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.dataset.category = category.slug || category.name.toLowerCase();
        
        const iconName = getCategoryIcon(category.name);
        button.innerHTML = `
            <i data-lucide="${iconName}" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>
            ${escapeHtml(category.name)}
        `;
        
        container.appendChild(button);
    });
    
    // Re-initialize Lucide icons for new buttons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function performAdvancedSearch() {
    const query = document.getElementById('advanced-search-input').value;
    const resultsDiv = document.getElementById('advanced-search-results');
    
    if (!query) {
        alert('Please enter a search query!');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">🔍 Searching...</div>';
    
    try {
        // Build search query with category if not "all"
        let searchQuery = query;
        if (currentCategory !== 'all') {
            searchQuery = `${currentCategory} ${query}`;
        }
        
        const response = await fetch(`/api/myinstants/search?query=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        
        if (!data.success || data.results.length === 0) {
            resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">No results found. Try a different search term or category.</div>';
            return;
        }
        
        renderSearchResults(data.results, resultsDiv);
    } catch (error) {
        console.error('Error searching MyInstants:', error);
        resultsDiv.innerHTML = '<div class="text-red-400 text-sm text-center py-4">Error searching MyInstants. Please try again.</div>';
    }
}

async function searchTrending() {
    const resultsDiv = document.getElementById('advanced-search-results');
    resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">🔍 Loading trending sounds...</div>';
    
    try {
        const response = await fetch('/api/myinstants/trending');
        const data = await response.json();
        
        if (!data.success || data.results.length === 0) {
            resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">No trending sounds found.</div>';
            return;
        }
        
        renderSearchResults(data.results, resultsDiv);
    } catch (error) {
        console.error('Error loading trending sounds:', error);
        resultsDiv.innerHTML = '<div class="text-red-400 text-sm text-center py-4">Error loading trending sounds.</div>';
    }
}

function renderSearchResults(results, container) {
    container.innerHTML = '';
    
    results.forEach(sound => {
        const div = document.createElement('div');
        div.className = 'myinstants-result-item';
        
        // Create preview button
        const previewBtn = document.createElement('button');
        previewBtn.className = 'bg-blue-600 px-3 py-2 rounded text-sm hover:bg-blue-700 transition flex items-center gap-2';
        previewBtn.title = 'Preview this sound';
        previewBtn.dataset.action = 'test-sound';
        previewBtn.dataset.url = sound.url;
        previewBtn.innerHTML = `
            <i data-lucide="play" style="width: 14px; height: 14px;"></i>
            <span>Preview</span>
        `;
        
        // Create use button
        const useBtn = document.createElement('button');
        useBtn.className = 'bg-green-600 px-3 py-2 rounded text-sm hover:bg-green-700 transition flex items-center gap-2';
        useBtn.title = 'Bind this sound to a gift';
        useBtn.dataset.action = 'bind-to-gift';
        useBtn.dataset.name = sound.name;
        useBtn.dataset.url = sound.url;
        useBtn.innerHTML = `
            <i data-lucide="link" style="width: 14px; height: 14px;"></i>
            <span>Use</span>
        `;
        
        // Create result structure
        div.innerHTML = `
            <div class="myinstants-result-info">
                <div class="myinstants-result-name">${escapeHtml(sound.name)}</div>
                <div class="myinstants-result-url">${escapeHtml(sound.url)}</div>
            </div>
            <div class="myinstants-result-actions"></div>
        `;
        
        // Append buttons to actions div
        const actionsDiv = div.querySelector('.myinstants-result-actions');
        actionsDiv.appendChild(previewBtn);
        actionsDiv.appendChild(useBtn);
        
        container.appendChild(div);
    });
    
    // Re-initialize Lucide icons for new elements
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function handleCategoryClick(category) {
    currentCategory = category;
    
    // Update active state
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
}

// ========== GIFT CATALOG MODAL ==========
async function openGiftCatalogModal(soundName, soundUrl) {
    selectedSoundForBinding = { name: soundName, url: soundUrl };
    
    // Update selected sound info
    document.getElementById('selected-sound-name').textContent = soundName;
    
    // Load gift catalog
    const gridDiv = document.getElementById('modal-gift-grid');
    gridDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-8">Loading gifts...</div>';
    
    try {
        const response = await fetch('/api/soundboard/catalog');
        const data = await response.json();
        
        if (!data.success || !data.gifts || data.gifts.length === 0) {
            gridDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-8">No gifts available. Please start a TikTok LIVE stream to populate the gift catalog.</div>';
        } else {
            // Get current gift sounds to mark which gifts already have sounds
            const giftSoundsResponse = await fetch('/api/soundboard/gifts');
            const giftSoundsData = await giftSoundsResponse.json();
            const giftSoundsMap = {};
            giftSoundsData.forEach(gs => {
                giftSoundsMap[gs.giftId] = true;
            });
            
            gridDiv.innerHTML = '';
            data.gifts.forEach(gift => {
                const card = document.createElement('div');
                card.className = 'gift-card';
                if (giftSoundsMap[gift.id]) {
                    card.classList.add('has-sound');
                }
                card.dataset.giftId = gift.id;
                card.dataset.giftLabel = gift.name;
                
                const imageHtml = gift.diamond_count 
                    ? `<div class="gift-card-image">💎</div>`
                    : `<div class="gift-card-image">🎁</div>`;
                
                card.innerHTML = `
                    ${imageHtml}
                    <div class="gift-card-name">${escapeHtml(gift.name)}</div>
                    <div class="gift-card-id">ID: ${gift.id}</div>
                    <div class="gift-card-coins">${gift.diamond_count || 0} 💎</div>
                    ${giftSoundsMap[gift.id] ? '<div class="gift-card-badge">Has Sound</div>' : ''}
                `;
                
                card.addEventListener('click', () => bindSoundToGift(gift.id, gift.name));
                gridDiv.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Error loading gift catalog:', error);
        gridDiv.innerHTML = '<div class="text-red-400 text-sm text-center py-8">Error loading gifts. Please try again.</div>';
    }
    
    // Show modal
    document.getElementById('gift-catalog-modal').classList.add('active');
}

function closeGiftCatalogModal() {
    document.getElementById('gift-catalog-modal').classList.remove('active');
    selectedSoundForBinding = null;
}

async function bindSoundToGift(giftId, giftLabel) {
    if (!selectedSoundForBinding) {
        alert('No sound selected!');
        return;
    }
    
    try {
        const response = await fetch('/api/soundboard/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giftId: parseInt(giftId),
                label: giftLabel,
                mp3Url: selectedSoundForBinding.url,
                volume: 1.0,
                animationUrl: null,
                animationType: 'none'
            })
        });
        
        const result = await response.json();
        if (result.success) {
            alert(`✅ Sound "${selectedSoundForBinding.name}" successfully bound to gift "${giftLabel}"!`);
            closeGiftCatalogModal();
            
            // Reload gift sounds list
            await loadGiftSounds();
            await loadGiftCatalog();
        } else {
            alert('❌ Failed to bind sound to gift. Please try again.');
        }
    } catch (error) {
        console.error('Error binding sound to gift:', error);
        alert('❌ Error binding sound to gift!');
    }
}

// ========== AUDIO TESTING & PERMISSIONS ==========
// Audio test section has been removed. Modern browsers handle audio playback without explicit 
// permission prompts when triggered by user interaction. For debugging audio issues, use 
// browser DevTools Console and Network tabs to monitor audio playback and errors.

// ========== EVENT LISTENERS ==========
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Load initial data
    loadSoundboardSettings();
    loadGiftSounds();
    loadGiftCatalog();
    loadCategories(); // Load categories for advanced search
    
    // Soundboard save button
    const saveSoundboardBtn = document.getElementById('save-soundboard-btn');
    if (saveSoundboardBtn) {
        saveSoundboardBtn.addEventListener('click', saveSoundboardSettings);
    }
    
    // Test sound buttons (event delegation)
    document.addEventListener('click', function(event) {
        const testSoundBtn = event.target.closest('[data-test-sound]');
        if (testSoundBtn) {
            const soundType = testSoundBtn.dataset.testSound;
            testEventSound(soundType);
            return;
        }
        
        // Handle MyInstants and gift sound action buttons
        const actionBtn = event.target.closest('[data-action]');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            if (action === 'test-sound') {
                const url = actionBtn.dataset.url;
                const volume = parseFloat(actionBtn.dataset.volume) || 1.0;
                testGiftSound(url, volume);
            } else if (action === 'use-sound') {
                const name = actionBtn.dataset.name;
                const url = actionBtn.dataset.url;
                useMyInstantsSound(name, url);
            } else if (action === 'bind-to-gift') {
                const name = actionBtn.dataset.name;
                const url = actionBtn.dataset.url;
                openGiftCatalogModal(name, url);
            } else if (action === 'delete-gift') {
                const giftId = parseInt(actionBtn.dataset.giftId);
                deleteGiftSound(giftId);
            }
            return;
        }
    });
    
    // Catalog refresh button
    const refreshCatalogBtn = document.getElementById('refresh-catalog-btn');
    if (refreshCatalogBtn) {
        refreshCatalogBtn.addEventListener('click', refreshGiftCatalog);
    }
    
    // MyInstants search
    const myinstantsSearchBtn = document.getElementById('myinstants-search-btn');
    if (myinstantsSearchBtn) {
        myinstantsSearchBtn.addEventListener('click', searchMyInstants);
    }
    
    // MyInstants search on Enter key
    const myinstantsSearchInput = document.getElementById('myinstants-search-input');
    if (myinstantsSearchInput) {
        myinstantsSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchMyInstants();
            }
        });
    }
    
    // Add gift sound button
    const addGiftSoundBtn = document.getElementById('add-gift-sound-btn');
    if (addGiftSoundBtn) {
        addGiftSoundBtn.addEventListener('click', addGiftSound);
    }
    
    // Clear gift form button
    const clearGiftFormBtn = document.getElementById('clear-gift-form-btn');
    if (clearGiftFormBtn) {
        clearGiftFormBtn.addEventListener('click', clearGiftSoundForm);
    }
    
    // Advanced search button
    const advancedSearchBtn = document.getElementById('advanced-search-btn');
    if (advancedSearchBtn) {
        advancedSearchBtn.addEventListener('click', performAdvancedSearch);
    }
    
    // Advanced search on Enter key
    const advancedSearchInput = document.getElementById('advanced-search-input');
    if (advancedSearchInput) {
        advancedSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performAdvancedSearch();
            }
        });
    }
    
    // Trending search button
    const trendingSearchBtn = document.getElementById('trending-search-btn');
    if (trendingSearchBtn) {
        trendingSearchBtn.addEventListener('click', searchTrending);
    }
    
    // Category buttons (event delegation for dynamically loaded categories)
    const categoryContainer = document.getElementById('category-buttons-container');
    if (categoryContainer) {
        categoryContainer.addEventListener('click', function(e) {
            const categoryBtn = e.target.closest('.category-btn');
            if (categoryBtn && categoryBtn.dataset.category) {
                handleCategoryClick(categoryBtn.dataset.category);
            }
        });
    }
    
    // Close gift catalog modal
    const closeGiftModalBtn = document.getElementById('close-gift-modal');
    if (closeGiftModalBtn) {
        closeGiftModalBtn.addEventListener('click', closeGiftCatalogModal);
    }
    
    // Close modal when clicking overlay
    const giftCatalogModal = document.getElementById('gift-catalog-modal');
    if (giftCatalogModal) {
        giftCatalogModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeGiftCatalogModal();
            }
        });
    }
});
