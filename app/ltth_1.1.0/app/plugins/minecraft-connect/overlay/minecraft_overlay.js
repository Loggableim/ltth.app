/**
 * Minecraft Connect Overlay JavaScript
 */

(function() {
    'use strict';

    const container = document.getElementById('minecraft-overlay');
    let socket = null;

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
                ${username ? `<div class="mc-notification-user">Triggered by ${username}</div>` : ''}
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
        return action.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    // Format parameters
    function formatParameters(action, params) {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }

        switch (action) {
            case 'spawn_entity':
                return `Spawning ${params.count || 1}x ${params.entityId || 'entity'}`;
            
            case 'give_item':
                return `Giving ${params.count || 1}x ${params.itemId || 'item'}`;
            
            case 'change_weather':
                return `Changing weather to ${params.weatherType || 'unknown'}`;
            
            case 'set_time':
                return `Setting time to ${params.time || 'unknown'}`;
            
            case 'apply_potion_effect':
                return `Applying ${params.effectId || 'effect'}`;
            
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
