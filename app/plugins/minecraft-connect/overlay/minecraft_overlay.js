/**
 * Minecraft Connect Overlay JavaScript
 */

(function() {
    'use strict';

    const container = document.getElementById('minecraft-overlay');
    let socket = null;
    const timers = new Set();
    let disposed = false;
    const OVERLAY_I18N_PREFIX = 'plugins.minecraft-connect.minecraft_connect.overlay.';
    const ACTION_NAMES = new Set([
        'spawn_entity', 'give_item', 'change_weather', 'set_time',
        'apply_potion_effect', 'post_chat_message', 'execute_command'
    ]);

    function scheduleTimeout(callback, delay) {
        const timer = window.setTimeout(() => {
            timers.delete(timer);
            if (!disposed) callback();
        }, delay);
        timers.add(timer);
        return timer;
    }

    function interpolateOverlayFallback(fallback, params = {}) {
        return String(fallback).replace(/\{(\w+)\}/g, (match, name) => (
            Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
        ));
    }

    function overlayText(key, fallback, params = {}) {
        const translationKey = `${OVERLAY_I18N_PREFIX}${key}`;
        const translated = window.i18n && typeof window.i18n.t === 'function'
            ? window.i18n.t(translationKey, params)
            : translationKey;
        return translated && translated !== translationKey
            ? translated
            : interpolateOverlayFallback(fallback, params);
    }

    // Action icons
    const ACTION_ICONS = {
        spawn_entity: '🐑',
        give_item: '💎',
        change_weather: '⛈️',
        set_time: '🌙',
        apply_potion_effect: '🧪',
        post_chat_message: '💬',
        execute_command: '⚡',
        default: '🎮'
    };

    // Initialize
    function init() {
        console.log('[Minecraft Overlay] Initializing...');
        connectSocket();
    }

    // Connect to Socket.IO
    function connectSocket() {
        if (typeof io !== 'function') return;
        try {
            socket = io();
        } catch (error) {
            console.error('[Minecraft Overlay] Socket unavailable', error);
            return;
        }
        if (!socket || typeof socket.on !== 'function') return;
        
        socket.on('connect', () => {
            console.log('[Minecraft Overlay] Socket connected');
        });

        socket.on('minecraft-connect:overlay-show', (data) => {
            showNotification(data);
        });
    }

    // Show notification
    function showNotification(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data) || disposed) return;

        const action = typeof data.action === 'string' && ACTION_NAMES.has(data.action)
            ? data.action
            : 'unknown';
        const username = typeof data.username === 'string' ? data.username : '';
        const params = data.params && typeof data.params === 'object' && !Array.isArray(data.params)
            ? data.params
            : {};

        const notification = document.createElement('div');
        notification.className = 'mc-notification';
        if (ACTION_NAMES.has(action)) notification.classList.add(action);

        const icon = ACTION_ICONS[action] || ACTION_ICONS.default;
        const actionName = formatActionName(action);
        const paramText = formatParameters(action, params);

        const header = document.createElement('div');
        header.className = 'mc-notification-header';
        const iconElement = document.createElement('div');
        iconElement.className = 'mc-notification-icon';
        iconElement.textContent = icon;
        const title = document.createElement('div');
        title.className = 'mc-notification-title';
        title.textContent = actionName;
        header.append(iconElement, title);

        const body = document.createElement('div');
        body.className = 'mc-notification-body';
        if (paramText) {
            const actionElement = document.createElement('div');
            actionElement.className = 'mc-notification-action';
            actionElement.textContent = paramText;
            body.appendChild(actionElement);
        }
        if (username) {
            const userElement = document.createElement('div');
            userElement.className = 'mc-notification-user';
            userElement.textContent = overlayText('triggered_by', 'Triggered by {username}', { username });
            body.appendChild(userElement);
        }
        notification.append(header, body);
        container.appendChild(notification);
        createParticles(notification);
        scheduleTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Format action name
    function formatActionName(action) {
        const safeAction = ACTION_NAMES.has(action) ? action : 'unknown';
        const fallback = safeAction.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        return overlayText(`actions.${safeAction}`, fallback);
    }

    // Format parameters
    function formatParameters(action, params) {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }

        switch (action) {
            case 'spawn_entity':
                return overlayText('parameters.spawn_entity', 'Spawning {count}× {entity}', {
                    count: params.count || 1,
                    entity: params.entityId || overlayText('entity', 'entity')
                });
            
            case 'give_item':
                return overlayText('parameters.give_item', 'Giving {count}× {item}', {
                    count: params.count || 1,
                    item: params.itemId || overlayText('item', 'item')
                });
            
            case 'change_weather':
                return overlayText('parameters.change_weather', 'Changing weather to {weather}', {
                    weather: params.weatherType || overlayText('unknown', 'unknown')
                });
            
            case 'set_time':
                return overlayText('parameters.set_time', 'Setting time to {time}', {
                    time: params.time || overlayText('unknown', 'unknown')
                });
            
            case 'apply_potion_effect':
                return overlayText('parameters.apply_potion_effect', 'Applying {effect}', {
                    effect: params.effectId || overlayText('effect', 'effect')
                });
            
            case 'post_chat_message':
                return params.message || '';
            
            case 'execute_command':
                return `/${params.command || 'command'}`;
            
            default:
                return Object.entries(params)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');
        }
    }

    // Create particle effects
    function createParticles(element) {
        const particleCount = 10;
        
        for (let i = 0; i < particleCount; i++) {
            scheduleTimeout(() => {
                const particle = document.createElement('div');
                particle.className = 'mc-particle';
                
                // Random position
                const x = Math.random() * element.offsetWidth;
                particle.style.left = `${x}px`;
                particle.style.bottom = '0';
                
                // Random delay
                particle.style.animationDelay = `${Math.random() * 0.5}s`;
                
                element.appendChild(particle);
                
                // Remove after animation
                scheduleTimeout(() => {
                    particle.remove();
                }, 2500);
            }, i * 100);
        }
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        for (const timer of timers) window.clearTimeout(timer);
        timers.clear();
        if (socket && typeof socket.disconnect === 'function') socket.disconnect();
        socket = null;
        container.replaceChildren();
    }

    window.addEventListener('pagehide', event => {
        if (event.persisted) return;
        dispose();
    });

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
