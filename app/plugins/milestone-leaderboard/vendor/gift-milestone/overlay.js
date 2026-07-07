const socket = io();

const container = document.getElementById('milestone-container');
const celebrationContent = document.getElementById('celebrationContent');
const thankYou = document.getElementById('milestone-thank-you');
const title = document.getElementById('milestone-title');
const tierStatus = document.getElementById('milestone-tier-status');
const gif = document.getElementById('milestone-gif');
const video = document.getElementById('milestone-video');
const audio = document.getElementById('milestone-audio');
const confettiContainer = document.getElementById('confettiContainer');

let currentTimeout = null;
let isPlaying = false;
const celebrationQueue = [];
const MAX_QUEUE_SIZE = 10;

// Listen for milestone celebrations
socket.on('milestone:celebrate', (data) => {
    console.log('Milestone celebration triggered:', data);
    playCelebration(data);
});

async function playCelebration(data) {
    if (isPlaying) {
        if (celebrationQueue.length >= MAX_QUEUE_SIZE) {
            console.log('Celebration queue full, dropping oldest');
            celebrationQueue.shift();
        }
        celebrationQueue.push(data);
        console.log(`Celebration queued (${celebrationQueue.length}/${MAX_QUEUE_SIZE})`);
        return;
    }

    isPlaying = true;

    // Clear any existing timeout
    if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
    }

    // Update title and messages
    if (data.username) {
        thankYou.textContent = `Danke @${data.username}! 🙏`;
        thankYou.style.display = 'block';
    } else {
        thankYou.style.display = 'none';
    }

    title.textContent = `🎯 ${data.milestone.toLocaleString()} Coins Milestone! 🎉`;

    if (data.tier) {
        tierStatus.textContent = `Du hast ${data.tier} erreicht! 🏆`;
        tierStatus.style.display = 'block';
    } else {
        tierStatus.style.display = 'none';
    }

    // Reset media visibility
    gif.style.display = 'none';
    video.style.display = 'none';
    gif.src = '';
    video.src = '';
    audio.src = '';

    // Load and display media
    let mediaDuration = data.duration || 0;
    const mediaLoadPromises = [];

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
        // Only mute video when a separate audio file is provided to avoid double audio
        video.muted = !!data.audio;
        video.src = data.video;
        video.style.display = 'block';
        video.load();

        mediaLoadPromises.push(new Promise((resolve) => {
            video.addEventListener('loadedmetadata', () => {
                if (mediaDuration === 0) {
                    mediaDuration = video.duration * 1000;
                }
                resolve();
            }, { once: true });
            // Fallback in case loadedmetadata never fires
            setTimeout(resolve, 5000);
        }));

        video.play().catch(err => console.error('Error playing video:', err));
    }

    // Load and play audio
    if (data.audio) {
        audio.src = data.audio;
        audio.volume = (data.audioVolume || 80) / 100;
        audio.load();

        if (!data.video && !data.gif) {
            mediaLoadPromises.push(new Promise((resolve) => {
                audio.addEventListener('loadedmetadata', () => {
                    if (mediaDuration === 0) {
                        mediaDuration = audio.duration * 1000;
                    }
                    resolve();
                }, { once: true });
                // Fallback in case loadedmetadata never fires
                setTimeout(resolve, 5000);
            }));
        }

        audio.play().catch(err => console.error('Error playing audio:', err));
    }

    // Show container
    container.classList.add('active');
    celebrationContent.classList.remove('exiting');

    // Wait for media metadata before scheduling the hide timeout
    await Promise.all(mediaLoadPromises);

    // Trigger visual effects
    createConfetti();
    createFireworks();

    // Set default duration if still 0
    if (mediaDuration === 0) {
        mediaDuration = 10000; // Default 10 seconds
    }

    createSparkles(mediaDuration);

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

        // Play next queued celebration
        if (celebrationQueue.length > 0) {
            const next = celebrationQueue.shift();
            setTimeout(() => playCelebration(next), 300);
        }
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
function createSparkles(duration) {
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

    // Clear after celebration duration
    setTimeout(() => {
        clearInterval(sparkleInterval);
    }, duration || 10000);
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
