/**
 * Minecraft Connect Overlay JavaScript
 */

(function() {
    'use strict';

    const container = document.getElementById('minecraft-overlay');
    let socket = null;
    const OVERLAY_I18N_PREFIX = 'plugins.minecraft-connect.minecraft_connect.overlay.';

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
        socket = io();
        
        socket.on('connect', () => {
            console.log('[Minecraft Overlay] Socket connected');
        });

        socket.on('minecraft-connect:overlay-show', (data) => {
            showNotification(data);
        });
    }

    // Show notification
    function showNotification(data) {
        const { action, username, params } = data;
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `mc-notification ${action}`;
        
        // Get icon
        const icon = ACTION_ICONS[action] || ACTION_ICONS.default;
        
        // Format action name
        const actionName = formatActionName(action);
        
        // Format parameters
        const paramText = formatParameters(action, params);
        
        notification.innerHTML = `
            <div class="mc-notification-header">
                <div class="mc-notification-icon">${icon}</div>
                <div class="mc-notification-title">${actionName}</div>
            </div>
            <div class="mc-notification-body">
                ${paramText ? `<div class="mc-notification-action">${paramText}</div>` : ''}
                ${username ? `<div class="mc-notification-user">${overlayText('triggered_by', 'Triggered by {username}', { username })}</div>` : ''}
            </div>
        `;
        
        // Add to container
        container.appendChild(notification);
        
        // Create particles
        createParticles(notification);
        
        // Remove after animation
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Format action name
    function formatActionName(action) {
        const fallback = action.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        return overlayText(`actions.${action}`, fallback);
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
            setTimeout(() => {
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
                setTimeout(() => {
                    particle.remove();
                }, 2500);
            }, i * 100);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
