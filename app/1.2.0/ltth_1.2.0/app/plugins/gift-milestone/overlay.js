const socket = io();

const container = document.getElementById('milestone-container');
const celebrationContent = document.getElementById('celebrationContent');
const title = document.getElementById('milestone-title');
const gif = document.getElementById('milestone-gif');
const video = document.getElementById('milestone-video');
const audio = document.getElementById('milestone-audio');
const confettiContainer = document.getElementById('confettiContainer');

let currentTimeout = null;
let isPlaying = false;

// Listen for milestone celebrations
socket.on('milestone:celebrate', (data) => {
    console.log('Milestone celebration triggered:', data);
    playCelebration(data);
});

async function playCelebration(data) {
    if (isPlaying) {
        console.log('Celebration already playing, skipping...');
        return;
    }

    isPlaying = true;

    // Clear any existing timeout
    if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
    }

    // Update title
    title.textContent = `🎯 ${data.milestone.toLocaleString()} Coins Milestone! 🎉`;

    // Reset media visibility
    gif.style.display = 'none';
    video.style.display = 'none';
    gif.src = '';
    video.src = '';
    audio.src = '';

    // Load and display media
    let mediaDuration = data.duration || 0;

    // Load GIF
    if (data.gif) {
        gif.src = data.gif;
        gif.style.display = 'block';
        if (mediaDuration === 0) {
            mediaDuration = 5000; // Default 5 seconds for GIF
        }
    }

    // Load Video
    if (data.video) {
        video.src = data.video;
        video.style.display = 'block';
        video.load();

        // Get video duration
        video.addEventListener('loadedmetadata', () => {
            if (mediaDuration === 0) {
                mediaDuration = video.duration * 1000;
            }
        }, { once: true });

        video.play().catch(err => console.error('Error playing video:', err));
    }

    // Load and play audio
    if (data.audio) {
        audio.src = data.audio;
        audio.volume = (data.audioVolume || 80) / 100;
        audio.load();

        // Get audio duration
        audio.addEventListener('loadedmetadata', () => {
            if (mediaDuration === 0 && !data.video && !data.gif) {
                mediaDuration = audio.duration * 1000;
            }
        }, { once: true });

        audio.play().catch(err => console.error('Error playing audio:', err));
    }

    // Show container
    container.classList.add('active');
    celebrationContent.classList.remove('exiting');

    // Trigger visual effects
    createConfetti();
    createFireworks();
    createSparkles();

    // Set default duration if still 0
    if (mediaDuration === 0) {
        mediaDuration = 10000; // Default 10 seconds
    }

    // Hide after duration
    currentTimeout = setTimeout(() => {
        hideCelebration();
    }, mediaDuration);
}

function hideCelebration() {
    celebrationContent.classList.add('exiting');

    setTimeout(() => {
        container.classList.remove('active');
        celebrationContent.classList.remove('exiting');

        // Stop all media
        video.pause();
        audio.pause();
        video.src = '';
        audio.src = '';
        gif.src = '';

        // Clear confetti
        confettiContainer.innerHTML = '';

        isPlaying = false;
    }, 500);
}

// Create confetti effect
function createConfetti() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#ff1493'];
    const confettiCount = 100;

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        confetti.style.animationDelay = (Math.random() * 0.5) + 's';
        confettiContainer.appendChild(confetti);

        // Remove after animation
        setTimeout(() => {
            confetti.remove();
        }, 5000);
    }
}

// Create fireworks effect
function createFireworks() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#ff1493'];
    const fireworksCount = 5;

    for (let i = 0; i < fireworksCount; i++) {
        setTimeout(() => {
            const centerX = Math.random() * window.innerWidth;
            const centerY = Math.random() * (window.innerHeight * 0.6);

            for (let j = 0; j < 30; j++) {
                const firework = document.createElement('div');
                firework.className = 'firework';
                firework.style.left = centerX + 'px';
                firework.style.top = centerY + 'px';
                firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

                const angle = (Math.PI * 2 * j) / 30;
                const velocity = Math.random() * 100 + 50;
                const tx = Math.cos(angle) * velocity;
                const ty = Math.sin(angle) * velocity;

                firework.style.setProperty('--tx', tx + 'px');
                firework.style.setProperty('--ty', ty + 'px');

                confettiContainer.appendChild(firework);

                setTimeout(() => {
                    firework.remove();
                }, 1000);
            }
        }, i * 500);
    }
}

// Create sparkles effect
function createSparkles() {
    const sparkleInterval = setInterval(() => {
        if (!isPlaying) {
            clearInterval(sparkleInterval);
            return;
        }

        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle';
        sparkle.textContent = '✨';
        sparkle.style.left = Math.random() * 100 + '%';
        sparkle.style.top = Math.random() * 100 + '%';
        sparkle.style.fontSize = (Math.random() * 20 + 15) + 'px';
        confettiContainer.appendChild(sparkle);

        setTimeout(() => {
            sparkle.remove();
        }, 2000);
    }, 200);

    // Clear after 10 seconds
    setTimeout(() => {
        clearInterval(sparkleInterval);
    }, 10000);
}

// Handle exclusive mode
socket.on('milestone:exclusive-start', () => {
    console.log('Exclusive playback mode started');
    // Other plugins should listen to this event to pause their alerts
});

socket.on('milestone:exclusive-end', () => {
    console.log('Exclusive playback mode ended');
    // Other plugins should listen to this event to resume their alerts
});

console.log('Gift Milestone Overlay initialized');
