/**
 * Leaderboard Overlay Frontend Script
 * Handles WebSocket connection and live updates
 */

class LeaderboardOverlay {
    constructor() {
        this.socket = null;
        this.currentTab = 'session';
        this.sessionData = [];
        this.alltimeData = [];
        this.previousSessionRanks = new Map(); // Track previous ranks for animations
        this.previousAlltimeRanks = new Map();
        
        this.init();
    }

    init() {
        // Check if we're in preview mode
        const urlParams = new URLSearchParams(window.location.search);
        this.previewMode = urlParams.get('preview') === 'true';
        
        // Connect to Socket.io
        this.connectSocket();
        
        // Setup tab switching
        this.setupTabs();
        
        // Initial data fetch
        if (this.previewMode) {
            this.fetchTestData();
        } else {
            this.fetchInitialData();
        }
        
        // Auto-rotate tabs every 30 seconds (optional - can be disabled)
        this.enableAutoRotate = false; // Set to true to enable auto-rotation
        if (this.enableAutoRotate) {
            this.startAutoRotate();
        }
    }

    connectSocket() {
        // Skip socket connection in preview mode
        if (this.previewMode) {
            console.log('Preview mode - socket connection skipped');
            return;
        }
        
        this.socket = io();
        
        // Listen for leaderboard updates
        this.socket.on('leaderboard:update', (data) => {
            console.log('Leaderboard update received:', data);
            this.handleLeaderboardUpdate(data);
        });

        // Listen for session reset
        this.socket.on('leaderboard:session-reset', (data) => {
            console.log('Session reset:', data);
            this.sessionData = [];
            this.previousSessionRanks.clear();
            this.renderLeaderboard('session', []);
        });

        // Request initial update
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.socket.emit('leaderboard:request-update');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
    }

    async fetchInitialData() {
        try {
            const response = await fetch('/api/plugins/leaderboard/combined?limit=10');
            const result = await response.json();
            
            if (result.success) {
                this.handleLeaderboardUpdate(result);
            }
        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    }

    async fetchTestData() {
        try {
            const response = await fetch('/api/plugins/leaderboard/test-data');
            const result = await response.json();
            
            if (result.success) {
                this.handleLeaderboardUpdate(result);
                
                // In preview mode, periodically simulate rank changes
                setInterval(() => {
                    this.simulateRankChanges();
                }, 5000); // Update every 5 seconds to show animations
            }
        } catch (error) {
            console.error('Error fetching test data:', error);
        }
    }

    simulateRankChanges() {
        // Randomly adjust coins to simulate overtaking
        if (this.sessionData.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(5, this.sessionData.length));
            const coinBoost = Math.floor(Math.random() * 3000) + 1000;
            
            // Clone and modify session data
            const newData = [...this.sessionData];
            if (newData[randomIndex]) {
                newData[randomIndex] = {
                    ...newData[randomIndex],
                    coins: newData[randomIndex].coins + coinBoost
                };
                
                // Re-sort by coins
                newData.sort((a, b) => b.coins - a.coins);
                
                // Update ranks
                newData.forEach((entry, index) => {
                    entry.rank = index + 1;
                });
                
                this.updateSessionData(newData);
                this.renderLeaderboard('session', this.sessionData);
            }
        }
    }

    handleLeaderboardUpdate(data) {
        // Update session leaderboard
        if (data.session) {
            this.updateSessionData(data.session.data || []);
            this.renderLeaderboard('session', this.sessionData);
            
            // Update session start time
            if (data.session.startTime) {
                this.updateSessionStartTime(data.session.startTime);
            }
        }

        // Update all-time leaderboard
        if (data.alltime) {
            this.updateAlltimeData(data.alltime.data || []);
            this.renderLeaderboard('alltime', this.alltimeData);
        }
    }

    updateSessionData(newData) {
        // Store previous ranks for animation
        this.sessionData.forEach(entry => {
            this.previousSessionRanks.set(entry.userId || entry.user_id, entry.rank);
        });
        
        this.sessionData = newData;
    }

    updateAlltimeData(newData) {
        // Store previous ranks for animation
        this.alltimeData.forEach(entry => {
            this.previousAlltimeRanks.set(entry.user_id || entry.userId, entry.rank || this.alltimeData.indexOf(entry) + 1);
        });
        
        this.alltimeData = newData;
    }

    renderLeaderboard(type, data) {
        const listElement = document.getElementById(`${type}-list`);
        
        if (!data || data.length === 0) {
            // Show empty state
            const emptyIcon = type === 'session' ? '🎁' : '🏆';
            const emptyText = type === 'session' ? 'Waiting for gifts...' : 'No champions yet...';
            listElement.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${emptyIcon}</div>
                    <p>${emptyText}</p>
                </div>
            `;
            return;
        }

        const previousRanks = type === 'session' ? this.previousSessionRanks : this.previousAlltimeRanks;
        
        // Build HTML
        let html = '';
        data.forEach((entry, index) => {
            const rank = entry.rank || index + 1;
            const userId = entry.user_id || entry.userId;
            const nickname = entry.nickname || 'Unknown User';
            const uniqueId = entry.unique_id || entry.uniqueId || '';
            const profilePic = entry.profile_picture_url || entry.profilePictureUrl || '';
            const coins = entry.total_coins || entry.coins || 0;
            
            // Determine rank icon/badge
            let rankDisplay = '';
            let rankClass = 'rank-other';
            if (rank === 1) {
                rankClass = 'rank-1';
                rankDisplay = '👑'; // Crown for leader
            } else if (rank === 2) {
                rankClass = 'rank-2';
                rankDisplay = '🥈'; // Silver medal
            } else if (rank === 3) {
                rankClass = 'rank-3';
                rankDisplay = '🥉'; // Bronze medal
            } else {
                rankDisplay = rank;
            }
            
            // Determine animation class for overtaking
            let animationClass = '';
            const previousRank = previousRanks.get(userId);
            if (previousRank !== undefined) {
                if (previousRank > rank) {
                    // Moved up in ranking - overtook someone!
                    animationClass = 'rank-up';
                    // Add extra celebration for big jumps
                    if (previousRank - rank >= 2) {
                        animationClass = 'rank-up-big';
                    }
                } else if (previousRank < rank) {
                    animationClass = 'rank-down';
                }
            } else {
                animationClass = 'new-entry';
            }
            
            // Build entry HTML
            html += `
                <div class="leaderboard-entry ${animationClass}" data-user-id="${this.escapeHtml(userId)}" data-rank="${rank}">
                    <div class="rank-badge ${rankClass}">
                        ${rankDisplay}
                    </div>
                    ${profilePic && this.isValidUrl(profilePic) ? `<img src="${this.escapeHtml(profilePic)}" alt="${this.escapeHtml(nickname)}" class="profile-pic" onerror="this.style.display='none'">` : ''}
                    <div class="user-info">
                        <div class="username">${this.escapeHtml(nickname)}</div>
                        ${uniqueId ? `<div class="user-id">@${this.escapeHtml(uniqueId)}</div>` : ''}
                    </div>
                    <div class="coins-display">
                        <div class="coins-amount">${this.formatNumber(coins)}</div>
                        <div class="coins-label">coins</div>
                    </div>
                </div>
            `;
        });
        
        listElement.innerHTML = html;
    }

    updateSessionStartTime(timestamp) {
        const element = document.getElementById('session-start-time');
        if (!element) return;
        
        const date = new Date(timestamp);
        const formatted = this.formatDate(date);
        element.textContent = formatted;
    }

    formatDate(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    escapeHtml(text) {
        // Handle null/undefined/non-string inputs
        if (text === null || text === undefined) {
            return '';
        }
        
        const str = String(text);
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return str.replace(/[&<>"']/g, m => map[m]);
    }

    isValidUrl(url) {
        // Basic URL validation for profile pictures
        if (!url || typeof url !== 'string') {
            return false;
        }
        try {
            const parsedUrl = new URL(url);
            // Only allow http/https protocols
            return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
        } catch {
            return false;
        }
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tab) {
        this.currentTab = tab;
        
        // Update active states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        document.querySelectorAll('.leaderboard-panel').forEach(panel => {
            if (panel.id === `${tab}-panel`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });
    }

    startAutoRotate() {
        setInterval(() => {
            if (this.currentTab === 'session') {
                this.switchTab('alltime');
            } else {
                this.switchTab('session');
            }
        }, 30000); // Rotate every 30 seconds
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.leaderboard = new LeaderboardOverlay();
});
