/**
 * Advanced Timer Overlay JavaScript
 * Handles real-time timer display in OBS overlays
 */

const socket = io();
let timerId = null;
let timer = null;
let template = 'default'; // default, progress, circular, minimal, big

// Get timer ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
timerId = urlParams.get('timer');
template = urlParams.get('template') || 'default';

if (!timerId) {
    console.error('No timer ID provided in URL');
    document.getElementById('timer-container').innerHTML = '<div style="color: white; text-align: center;">No timer ID specified</div>';
}

/**
 * Initialize overlay
 */
async function init() {
    if (!timerId) return;

    try {
        // Fetch timer data
        const response = await fetch(`/api/advanced-timer/timers/${timerId}`);
        const data = await response.json();

        if (data.success) {
            timer = data.timer;
            renderTimer();
            setupSocketListeners();
        } else {
            console.error('Timer not found');
            document.getElementById('timer-container').innerHTML = '<div style="color: white; text-align: center;">Timer not found</div>';
        }
    } catch (error) {
        console.error('Error loading timer:', error);
    }
}

/**
 * Setup Socket.IO listeners
 */
function setupSocketListeners() {
    socket.on('advanced-timer:tick', (data) => {
        if (data.id === timerId) {
            timer.current_value = data.currentValue;
            timer.state = data.state;
            updateTimerDisplay();
        }
    });

    socket.on('advanced-timer:started', (data) => {
        if (data.id === timerId) {
            timer.state = 'running';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:paused', (data) => {
        if (data.id === timerId) {
            timer.state = 'paused';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:stopped', (data) => {
        if (data.id === timerId) {
            timer.state = 'stopped';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:completed', (data) => {
        if (data.id === timerId) {
            timer.state = 'completed';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:reset', (data) => {
        if (data.id === timerId) {
            timer.current_value = data.currentValue;
            timer.state = 'stopped';
            updateTimerDisplay();
            updateTimerState();
        }
    });
}

/**
 * Render timer based on template
 */
function renderTimer() {
    const container = document.getElementById('timer-container');

    switch (template) {
        case 'progress':
            container.innerHTML = renderProgressTemplate();
            break;
        case 'circular':
            container.innerHTML = renderCircularTemplate();
            break;
        case 'minimal':
            container.innerHTML = renderMinimalTemplate();
            break;
        case 'big':
            container.innerHTML = renderBigTemplate();
            break;
        default:
            container.innerHTML = renderDefaultTemplate();
    }

    updateTimerDisplay();
    updateTimerState();
}

/**
 * Template renderers
 */
function renderDefaultTemplate() {
    return `<div class="timer-display">${formatTime(timer.current_value)}</div>`;
}

function renderProgressTemplate() {
    return `
        <div class="template-progress">
            <div class="timer-name">${escapeHtml(timer.name)}</div>
            <div class="timer-time">${formatTime(timer.current_value)}</div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
            </div>
        </div>
    `;
}

function renderCircularTemplate() {
    const radius = 135;
    const circumference = 2 * Math.PI * radius;
    
    return `
        <div class="template-circular">
            <svg width="300" height="300">
                <circle class="circle-bg" cx="150" cy="150" r="${radius}"></circle>
                <circle class="circle-progress" id="circle-progress" cx="150" cy="150" r="${radius}"
                    style="stroke-dasharray: ${circumference}; stroke-dashoffset: 0;"></circle>
            </svg>
            <div class="timer-text">
                <div class="timer-time">${formatTime(timer.current_value)}</div>
                <div class="timer-name">${escapeHtml(timer.name)}</div>
            </div>
        </div>
    `;
}

function renderMinimalTemplate() {
    return `<div class="template-minimal">${formatTime(timer.current_value)}</div>`;
}

function renderBigTemplate() {
    return `<div class="template-big">${formatTime(timer.current_value)}</div>`;
}

/**
 * Update timer display
 */
function updateTimerDisplay() {
    const timeText = formatTime(timer.current_value);

    switch (template) {
        case 'progress':
            const timeElement = document.querySelector('.template-progress .timer-time');
            if (timeElement) {
                timeElement.textContent = timeText;
            }
            updateProgressBar();
            break;

        case 'circular':
            const circularTimeElement = document.querySelector('.template-circular .timer-time');
            if (circularTimeElement) {
                circularTimeElement.textContent = timeText;
            }
            updateCircularProgress();
            break;

        case 'minimal':
            const minimalElement = document.querySelector('.template-minimal');
            if (minimalElement) {
                minimalElement.textContent = timeText;
            }
            break;

        case 'big':
            const bigElement = document.querySelector('.template-big');
            if (bigElement) {
                bigElement.textContent = timeText;
            }
            break;

        default:
            const defaultElement = document.querySelector('.timer-display');
            if (defaultElement) {
                defaultElement.textContent = timeText;
            }
    }
}

/**
 * Update progress bar
 */
function updateProgressBar() {
    const progressFill = document.getElementById('progress-fill');
    if (!progressFill) return;

    let percentage = 0;

    if (timer.mode === 'countdown' || timer.mode === 'loop') {
        // For countdown, show remaining time as percentage
        if (timer.initial_duration > 0) {
            percentage = (timer.current_value / timer.initial_duration) * 100;
        }
    } else if (timer.mode === 'countup' || timer.mode === 'interval') {
        // For count up, show progress towards target
        if (timer.target_value > 0) {
            percentage = (timer.current_value / timer.target_value) * 100;
        }
    } else {
        // Stopwatch - no progress bar
        percentage = 100;
    }

    progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
}

/**
 * Update circular progress
 */
function updateCircularProgress() {
    const circleProgress = document.getElementById('circle-progress');
    if (!circleProgress) return;

    const radius = 135;
    const circumference = 2 * Math.PI * radius;

    let percentage = 0;

    if (timer.mode === 'countdown' || timer.mode === 'loop') {
        if (timer.initial_duration > 0) {
            percentage = (timer.current_value / timer.initial_duration) * 100;
        }
    } else if (timer.mode === 'countup' || timer.mode === 'interval') {
        if (timer.target_value > 0) {
            percentage = (timer.current_value / timer.target_value) * 100;
        }
    } else {
        percentage = 100;
    }

    const offset = circumference - (percentage / 100) * circumference;
    circleProgress.style.strokeDashoffset = offset;
}

/**
 * Update timer state styling
 */
function updateTimerState() {
    const container = document.getElementById('timer-container');
    const timeElements = container.querySelectorAll('.timer-display, .timer-time, .template-minimal, .template-big');

    timeElements.forEach(element => {
        element.classList.remove('state-running', 'state-paused', 'state-completed');
        element.classList.remove('animate-pulse', 'animate-glow');

        if (timer.state === 'running') {
            element.classList.add('state-running');
            if (timer.config.animateOnRunning) {
                element.classList.add('animate-pulse');
            }
        } else if (timer.state === 'paused') {
            element.classList.add('state-paused');
        } else if (timer.state === 'completed') {
            element.classList.add('state-completed');
            if (timer.config.animateOnComplete) {
                element.classList.add('animate-glow');
            }
        }
    });
}

/**
 * Utility functions
 */
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
