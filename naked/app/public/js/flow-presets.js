/**
 * Flow Presets / Templates
 * Pre-built flow templates that users can instantly deploy or customize.
 */

const FLOW_PRESETS = [
    {
        id: 'rose-thanks-tts',
        name: 'Rose → TTS Danke',
        description: 'Spricht eine Danke-Nachricht wenn jemand eine Rose schenkt',
        category: 'gift',
        icon: '🌹',
        flow: {
            name: 'Rose Gift → TTS Danke',
            trigger_type: 'tiktok:gift',
            trigger_condition: { field: 'giftName', operator: 'equals', value: 'Rose' },
            actions: [
                { type: 'tts:speak', text: 'Danke {{username}} für die Rose!', voice: '', volume: 80 }
            ],
            enabled: true,
            cooldown: 5
        }
    },
    {
        id: 'follow-alert',
        name: 'Follow → Alert',
        description: 'Zeigt einen Alert-Overlay wenn jemand folgt',
        category: 'follow',
        icon: '⭐',
        flow: {
            name: 'Neuer Follow → Alert',
            trigger_type: 'tiktok:follow',
            trigger_condition: null,
            actions: [
                { type: 'alert:show', text: '{{username}} folgt jetzt!', duration: 5, volume: 80 }
            ],
            enabled: true,
            cooldown: 3
        }
    },
    {
        id: 'sub-vrchat-dance',
        name: 'Sub → VRChat Dance',
        description: 'VRChat-Tanzanimation bei neuen Abonnenten',
        category: 'subscribe',
        icon: '🌟',
        flow: {
            name: 'Neues Abo → VRChat Dance',
            trigger_type: 'tiktok:subscribe',
            trigger_condition: null,
            actions: [
                { type: 'tts:speak', text: 'Vielen Dank {{username}} für das Abonnement!', voice: '', volume: 80 },
                { type: 'osc:vrchat:dance', parameter: '/avatar/parameters/Dance', value: true }
            ],
            enabled: true,
            cooldown: 10
        }
    },
    {
        id: 'big-gift-multi',
        name: 'Großes Geschenk → Alert + TTS + Emoji Rain',
        description: 'Geschenk mit mehr als 100 Coins triggert Alert, TTS und Emoji-Regen',
        category: 'gift',
        icon: '🎁',
        flow: {
            name: 'Großes Geschenk → Feier',
            trigger_type: 'tiktok:gift',
            trigger_condition: { field: 'coins', operator: 'greaterThan', value: '100' },
            actions: [
                { type: 'alert:show', text: '🎁 {{username}} hat {{giftName}} ({{coins}} Coins) geschenkt!', duration: 8, volume: 80 },
                { type: 'tts:speak', text: 'Wow! {{username}} hat {{giftName}} für {{coins}} Coins geschenkt. Mega vielen Dank!', voice: '', volume: 80 },
                { type: 'emojirain:trigger', emoji: '🎁', count: 30, duration: 4 }
            ],
            enabled: true,
            cooldown: 10
        }
    },
    {
        id: 'chat-wave-vrchat',
        name: '!wave → VRChat Winken',
        description: 'Chat-Befehl !wave löst VRChat-Wellenanimation aus',
        category: 'chat',
        icon: '👋',
        flow: {
            name: 'Chat !wave → VRChat Wave',
            trigger_type: 'tiktok:chat',
            trigger_condition: { field: 'message', operator: 'startsWith', value: '!wave' },
            actions: [
                { type: 'osc:vrchat:wave', parameter: '/avatar/parameters/Wave', value: true }
            ],
            enabled: true,
            cooldown: 5
        }
    },
    {
        id: 'like-milestone-confetti',
        name: 'Like-Meilenstein → Konfetti',
        description: 'Konfetti bei mehr als 1000 Likes',
        category: 'like',
        icon: '❤️',
        flow: {
            name: 'Like Meilenstein → Konfetti',
            trigger_type: 'tiktok:like',
            trigger_condition: { field: 'likeCount', operator: 'greaterThan', value: '1000' },
            actions: [
                { type: 'osc:vrchat:confetti', parameter: '/avatar/parameters/Confetti', value: true },
                { type: 'tts:speak', text: 'Wow, über 1000 Likes! Danke an alle!', voice: '', volume: 80 }
            ],
            enabled: true,
            cooldown: 60
        }
    },
    {
        id: 'share-hearts',
        name: 'Share → Herzen',
        description: 'VRChat-Herzen-Animation bei Stream-Share',
        category: 'share',
        icon: '🔗',
        flow: {
            name: 'Stream Share → Herzen',
            trigger_type: 'tiktok:share',
            trigger_condition: null,
            actions: [
                { type: 'osc:vrchat:hearts', parameter: '/avatar/parameters/Hearts', value: true },
                { type: 'tts:speak', text: 'Danke {{username}} fürs Teilen!', voice: '', volume: 80 }
            ],
            enabled: true,
            cooldown: 5
        }
    },
    {
        id: 'gift-emoji-rain',
        name: 'Geschenk → Emoji-Regen',
        description: 'Jedes Geschenk löst einen Emoji-Regen mit dem Geschenk-Emoji aus',
        category: 'gift',
        icon: '🎉',
        flow: {
            name: 'Jedes Geschenk → Emoji Rain',
            trigger_type: 'tiktok:gift',
            trigger_condition: null,
            actions: [
                { type: 'emojirain:trigger', emoji: '🎁', count: 20, duration: 3 }
            ],
            enabled: true,
            cooldown: 3
        }
    },
    {
        id: 'gift-flame-burst',
        name: 'Geschenk → Flammen-Burst',
        description: 'Große Geschenke (100+ Coins) lösen einen Flammen-Burst aus',
        category: 'gift',
        icon: '🔥',
        flow: {
            name: 'Großes Geschenk → Flammen Burst',
            trigger_type: 'tiktok:gift',
            trigger_condition: { field: 'coins', operator: 'greaterThan', value: '100' },
            actions: [
                { type: 'flame-overlay:trigger', burstType: 'intensity-boost', intensity: 2.0, duration: 8000, color: '#ff0000' }
            ],
            enabled: true,
            cooldown: 10
        }
    },
    {
        id: 'sub-flame-particles',
        name: 'Abo → Partikel-Feuerwerk',
        description: 'Neues Abonnement löst Partikel-Effekt im Flame Overlay aus',
        category: 'subscribe',
        icon: '✨',
        flow: {
            name: 'Neues Abo → Partikel Overlay',
            trigger_type: 'tiktok:subscribe',
            trigger_condition: null,
            actions: [
                { type: 'flame-overlay:trigger', burstType: 'effect-switch', effectType: 'particles', duration: 10000, color: '#ffdd00' }
            ],
            enabled: true,
            cooldown: 15
        }
    },
    {
        id: 'follow-flame-glow',
        name: 'Follow → Flammen-Glow',
        description: 'Neue Follower lösen kurzen Flammen-Glow aus',
        category: 'follow',
        icon: '🔥',
        flow: {
            name: 'Neuer Follow → Flammen Glow',
            trigger_type: 'tiktok:follow',
            trigger_condition: null,
            actions: [
                { type: 'flame-overlay:trigger', burstType: 'intensity-boost', intensity: 1.5, duration: 3000, color: '#00ffaa' }
            ],
            enabled: true,
            cooldown: 5
        }
    }
];

/**
 * Get all presets
 * @returns {Array} Array of preset objects
 */
function getFlowPresets() {
    return FLOW_PRESETS;
}

/**
 * Get a preset by ID
 * @param {string} id - Preset ID
 * @returns {Object|null} Preset object or null
 */
function getFlowPresetById(id) {
    return FLOW_PRESETS.find(p => p.id === id) || null;
}

/**
 * Get presets by category
 * @param {string} category - Category name
 * @returns {Array} Filtered presets
 */
function getFlowPresetsByCategory(category) {
    return FLOW_PRESETS.filter(p => p.category === category);
}

/**
 * Get unique preset categories
 * @returns {Array} Array of category strings
 */
function getFlowPresetCategories() {
    return [...new Set(FLOW_PRESETS.map(p => p.category))];
}
