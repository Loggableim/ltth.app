// ============================================
// Quiz Show Overlay - Professional HUD System
// Vollständig konfigurierbar mit Drag & Drop
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION & STATE
    // ============================================

    const socket = io();

    // State Machine States
    const States = {
        IDLE: 'idle',
        QUESTION_INTRO: 'question_intro',
        RUNNING: 'running',
        TIME_LOW: 'time_low',
        TIME_UP: 'time_up',
        REVEAL_CORRECT: 'reveal_correct',
        WAIT_NEXT: 'wait_next'
    };

    let currentState = States.IDLE;
    let stateTimeout = null;

    // Game Data
    let gameData = {
        question: null,
        answers: [],
        correctIndex: null,
        timeRemaining: 0,
        totalTime: 30,
        hiddenAnswers: [],
        revealedWrongAnswer: null,
        answerDisplayDuration: 5, // Default to 5 seconds
        votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] },
        voterIconsConfig: {
            enabled: true,
            size: 'medium',
            maxVisible: 10,
            compactMode: true,
            animation: 'fade',
            position: 'above'
        }
    };

    // HUD Configuration (loaded from server)
    let hudConfig = {
        theme: 'dark',
        questionAnimation: 'slide-in-bottom',
        correctAnimation: 'glow-pulse',
        wrongAnimation: 'shake',
        timerVariant: 'circular',
        answersLayout: 'grid',
        animationSpeed: 1,
        glowIntensity: 1,
        customCSS: '',
        streamWidth: 1920,
        streamHeight: 1080,
        positions: {
            question: { top: null, left: null, width: '100%', maxWidth: '1200px' },
            answers: { top: null, left: null, width: '100%', maxWidth: '1200px' },
            timer: { top: null, left: null }
        },
        colors: {
            primary: '#3b82f6',
            secondary: '#8b5cf6',
            success: '#10b981',
            danger: '#ef4444',
            warning: '#f59e0b'
        },
        fonts: {
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            sizeQuestion: '2.2rem',
            sizeAnswer: '1.1rem'
        }
    };

    // Drag & Drop State
    let dragState = {
        isDragging: false,
        element: null,
        offsetX: 0,
        offsetY: 0,
        snapToGrid: true,
        gridSize: 10
    };

    // Timer Animation
    let timerAnimation = null;

    // ============================================
    // INITIALIZATION
    // ============================================

    document.addEventListener('DOMContentLoaded', () => {
        syncApplicationTheme();
        initializeSocketListeners();
        loadHUDConfig();
        initializeDragAndDrop();
        preloadAnimations();
        console.log('Quiz Show Overlay initialized');
    });

    // ============================================
    // THEME SYNCHRONIZATION
    // ============================================

    function syncApplicationTheme() {
        // Map application themes to overlay themes
        const themeMapping = {
            'night': 'dark',
            'day': 'day',
            'contrast': 'contrast'
        };
        
        // Read the application theme from localStorage (set by ThemeManager)
        const appTheme = localStorage.getItem('dashboard-theme') || 'night';
        const overlay = document.getElementById('overlay-container');
        
        if (overlay) {
            const mappedTheme = themeMapping[appTheme] || 'dark';
            
            // Apply the application theme to the overlay
            overlay.setAttribute('data-theme', mappedTheme);
            
            console.log('Application theme synced:', appTheme, '->', mappedTheme);
        }
        
        // Listen for theme changes from localStorage (when changed in parent window)
        window.addEventListener('storage', (e) => {
            if (e.key === 'dashboard-theme' && e.newValue) {
                const newTheme = themeMapping[e.newValue] || 'dark';
                if (overlay) {
                    overlay.setAttribute('data-theme', newTheme);
                    console.log('Theme updated from storage:', e.newValue, '->', newTheme);
                }
            }
        });
    }

    // ============================================
    // CONFIGURATION LOADING
    // ============================================

    async function loadHUDConfig() {
        try {
            const response = await fetch('/api/quiz-show/hud-config');
            if (response.ok) {
                const config = await response.json();
                if (config.success && config.config) {
                    hudConfig = { ...hudConfig, ...config.config };
                    applyHUDConfig();
                } else {
                    // Apply default config if none loaded
                    applyHUDConfig();
                }
            } else {
                // Apply default config if fetch failed
                applyHUDConfig();
            }

            // Load brand kit
            const brandResponse = await fetch('/api/quiz-show/brand-kit');
            if (brandResponse.ok) {
                const brandData = await brandResponse.json();
                if (brandData.success && brandData.brandKit) {
                    applyBrandKit(brandData.brandKit);
                }
            }
        } catch (error) {
            console.error('Error loading HUD config:', error);
            // Apply default config even on error
            applyHUDConfig();
        }
    }

    function applyHUDConfig() {
        const root = document.documentElement;
        const overlay = document.getElementById('overlay-container');

        // Apply Theme - Only apply HUD-specific themes (neon, gold)
        // For standard themes (dark, day, contrast), let the application theme take precedence
        const hudSpecificThemes = ['neon', 'gold'];
        const appTheme = localStorage.getItem('dashboard-theme') || 'night';
        
        if (hudSpecificThemes.includes(hudConfig.theme)) {
            // Apply HUD-specific custom theme
            overlay.setAttribute('data-theme', hudConfig.theme);
        } else {
            // Use application theme
            const themeMapping = {
                'night': 'dark',
                'day': 'day',
                'contrast': 'contrast'
            };
            overlay.setAttribute('data-theme', themeMapping[appTheme] || 'dark');
        }

        // Apply Colors
        if (hudConfig.colors) {
            root.style.setProperty('--color-primary', hudConfig.colors.primary);
            root.style.setProperty('--color-secondary', hudConfig.colors.secondary);
            root.style.setProperty('--color-success', hudConfig.colors.success);
            root.style.setProperty('--color-danger', hudConfig.colors.danger);
            root.style.setProperty('--color-warning', hudConfig.colors.warning);
        }

        // Apply Fonts
        if (hudConfig.fonts) {
            root.style.setProperty('--font-family', hudConfig.fonts.family);
            root.style.setProperty('--font-size-xl', hudConfig.fonts.sizeQuestion);
            root.style.setProperty('--font-size-md', hudConfig.fonts.sizeAnswer);
        }

        // Apply Animation Settings
        root.style.setProperty('--animation-speed', hudConfig.animationSpeed);
        root.style.setProperty('--glow-intensity', hudConfig.glowIntensity);

        // Apply Positions
        applyElementPositions();

        // Apply Timer Variant
        switchTimerVariant(hudConfig.timerVariant);

        // Apply Answers Layout
        const answersGrid = document.getElementById('answersGrid');
        answersGrid.className = 'answers-grid';
        if (hudConfig.answersLayout === 'vertical') {
            answersGrid.classList.add('layout-vertical');
        } else if (hudConfig.answersLayout === 'horizontal') {
            answersGrid.classList.add('layout-horizontal');
        }

        // Apply Custom CSS
        if (hudConfig.customCSS) {
            applyCustomCSS(hudConfig.customCSS);
        }

        console.log('HUD Config applied:', hudConfig);
    }

    function applyElementPositions() {
        if (!hudConfig.positions) return;

        // Question
        if (hudConfig.positions.question) {
            const questionSection = document.getElementById('questionSection');
            const pos = hudConfig.positions.question;
            if (pos.top !== null) questionSection.style.top = pos.top + 'px';
            if (pos.left !== null) questionSection.style.left = pos.left + 'px';
            if (pos.width) questionSection.style.width = pos.width;
            if (pos.maxWidth) questionSection.style.maxWidth = pos.maxWidth;
        }

        // Answers
        if (hudConfig.positions.answers) {
            const answersSection = document.getElementById('answersSection');
            const pos = hudConfig.positions.answers;
            if (pos.top !== null) answersSection.style.top = pos.top + 'px';
            if (pos.left !== null) answersSection.style.left = pos.left + 'px';
            if (pos.width) answersSection.style.width = pos.width;
            if (pos.maxWidth) answersSection.style.maxWidth = pos.maxWidth;
        }

        // Timer
        if (hudConfig.positions.timer) {
            const timerSection = document.getElementById('timerSection');
            const pos = hudConfig.positions.timer;
            if (pos.top !== null) timerSection.style.top = pos.top + 'px';
            if (pos.left !== null) timerSection.style.left = pos.left + 'px';
        }
    }

    function switchTimerVariant(variant) {
        const timers = ['timerCircular', 'timerBar', 'timerNeon', 'timerRing'];
        timers.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.remove('active');
            }
        });

        let activeTimer = 'timerCircular';
        if (variant === 'bar') activeTimer = 'timerBar';
        else if (variant === 'neon') activeTimer = 'timerNeon';
        else if (variant === 'ring') activeTimer = 'timerRing';

        const element = document.getElementById(activeTimer);
        if (element) {
            element.classList.add('active');
        }
    }

    function applyCustomCSS(css) {
        let styleElement = document.getElementById('custom-hud-css');
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'custom-hud-css';
            document.head.appendChild(styleElement);
        }
        styleElement.textContent = css;
    }

    // ============================================
    // DRAG & DROP SYSTEM
    // ============================================

    function initializeDragAndDrop() {
        const draggableElements = document.querySelectorAll('.draggable');

        draggableElements.forEach(element => {
            element.addEventListener('mousedown', startDrag);
        });

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'g' || e.key === 'G') {
                dragState.snapToGrid = !dragState.snapToGrid;
                console.log('Snap to grid:', dragState.snapToGrid);
            }
        });
    }

    function startDrag(e) {
        // Only allow dragging with Ctrl/Cmd key to prevent accidental moves
        if (!e.ctrlKey && !e.metaKey) return;

        dragState.isDragging = true;
        dragState.element = e.currentTarget;

        const rect = dragState.element.getBoundingClientRect();
        dragState.offsetX = e.clientX - rect.left;
        dragState.offsetY = e.clientY - rect.top;

        dragState.element.classList.add('dragging');
        e.preventDefault();
    }

    function doDrag(e) {
        if (!dragState.isDragging || !dragState.element) return;

        let x = e.clientX - dragState.offsetX;
        let y = e.clientY - dragState.offsetY;

        // Snap to grid
        if (dragState.snapToGrid) {
            x = Math.round(x / dragState.gridSize) * dragState.gridSize;
            y = Math.round(y / dragState.gridSize) * dragState.gridSize;
        }

        // Apply position
        dragState.element.style.position = 'fixed';
        dragState.element.style.left = x + 'px';
        dragState.element.style.top = y + 'px';
        dragState.element.style.transform = 'none';

        e.preventDefault();
    }

    function stopDrag(e) {
        if (!dragState.isDragging) return;

        dragState.element.classList.remove('dragging');

        // Save position
        const elementType = dragState.element.getAttribute('data-element');
        const rect = dragState.element.getBoundingClientRect();

        if (!hudConfig.positions) hudConfig.positions = {};
        if (!hudConfig.positions[elementType]) hudConfig.positions[elementType] = {};

        hudConfig.positions[elementType].top = rect.top;
        hudConfig.positions[elementType].left = rect.left;

        // Send to server
        saveHUDConfig();

        dragState.isDragging = false;
        dragState.element = null;
    }

    async function saveHUDConfig() {
        try {
            const response = await fetch('/api/quiz-show/hud-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(hudConfig)
            });

            if (!response.ok) {
                console.error('Failed to save HUD config');
            }
        } catch (error) {
            console.error('Error saving HUD config:', error);
        }
    }

    // ============================================
    // SOCKET.IO LISTENERS
    // ============================================

    function initializeSocketListeners() {
        socket.on('connect', () => {
            console.log('Overlay connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Overlay disconnected from server');
        });

        socket.on('quiz-show:state-update', handleStateUpdate);
        socket.on('quiz-show:time-update', handleTimeUpdate);
        socket.on('quiz-show:round-ended', handleRoundEnded);
        socket.on('quiz-show:joker-activated', handleJokerActivated);
        socket.on('quiz-show:stopped', handleQuizStopped);
        socket.on('quiz-show:hud-config-updated', handleHUDConfigUpdated);
        socket.on('quiz-show:play-sound', handlePlaySound);
        socket.on('quiz-show:quiz-ended', handleQuizEnded);
        socket.on('quiz-show:brand-kit-updated', handleBrandKitUpdated);
        socket.on('quiz-show:error', handleQuizError);
        
        // NEW: Leaderboard events
        socket.on('quiz-show:show-leaderboard', handleShowLeaderboard);
        socket.on('quiz-show:hide-leaderboard', handleHideLeaderboard);
        socket.on('quiz-show:leaderboard-updated', handleLeaderboardUpdated);
        
        // NEW: Custom layout events
        socket.on('quiz-show:layout-updated', handleLayoutUpdated);
    }

    function handleQuizError(data) {
        try {
            console.log('Quiz error:', data);
            
            // Display error message in HUD
            if (data.type === 'no_questions_available') {
                showErrorMessage(data.message || 'Neue Fragen notwendig');
            } else {
                showErrorMessage(data.message || 'Ein Fehler ist aufgetreten');
            }
        } catch (error) {
            console.error('Error handling quiz error:', error);
        }
    }

    function handlePlaySound(data) {
        try {
            if (!data.filePath) return;
            
            const audio = new Audio(data.filePath);
            audio.volume = data.volume || 1.0;
            audio.play().catch(err => console.warn('Could not play sound:', err));
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }

    function handleQuizEnded(data) {
        if (data.mvp) {
            showMVPDisplay(data.mvp);
        }
    }

    function handleBrandKitUpdated(brandKit) {
        console.log('Brand kit updated:', brandKit);
        applyBrandKit(brandKit);
    }

    function handleHUDConfigUpdated(config) {
        console.log('HUD config updated:', config);
        hudConfig = { ...hudConfig, ...config };
        applyHUDConfig();
    }

    // ============================================
    // STATE MACHINE
    // ============================================

    function transitionToState(newState) {
        console.log(`State transition: ${currentState} -> ${newState}`);

        if (stateTimeout) {
            clearTimeout(stateTimeout);
            stateTimeout = null;
        }

        exitState(currentState);
        currentState = newState;
        enterState(newState);
    }

    function exitState(state) {
        switch (state) {
            case States.RUNNING:
                if (timerAnimation) {
                    cancelAnimationFrame(timerAnimation);
                    timerAnimation = null;
                }
                break;
        }
    }

    function enterState(state) {
        switch (state) {
            case States.IDLE:
                hideOverlay();
                break;

            case States.QUESTION_INTRO:
                showOverlay();
                animateQuestionIntro();
                stateTimeout = setTimeout(() => {
                    transitionToState(States.RUNNING);
                }, 1500 / hudConfig.animationSpeed);
                break;

            case States.RUNNING:
                startTimer();
                break;

            case States.TIME_LOW:
                // Just a marker state, timer handles visual changes
                break;

            case States.TIME_UP:
                stopTimer();
                animateTimeUp();
                stateTimeout = setTimeout(() => {
                    transitionToState(States.REVEAL_CORRECT);
                }, 1000 / hudConfig.animationSpeed);
                break;

            case States.REVEAL_CORRECT:
                revealCorrectAnswer();
                // Use answerDisplayDuration from config (in milliseconds), fallback to 5000ms
                const displayDuration = (gameData.answerDisplayDuration || 5) * 1000;
                stateTimeout = setTimeout(() => {
                    transitionToState(States.WAIT_NEXT);
                }, displayDuration / hudConfig.animationSpeed);
                break;

            case States.WAIT_NEXT:
                break;
        }
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    function handleStateUpdate(state) {
        console.log('State update received:', state);

        if (state.isRunning && state.currentQuestion) {
            gameData = {
                question: state.currentQuestion.question,
                answers: state.currentQuestion.answers,
                correctIndex: null,
                timeRemaining: state.timeRemaining,
                totalTime: state.totalTime,
                hiddenAnswers: state.hiddenAnswers || [],
                revealedWrongAnswer: state.revealedWrongAnswer,
                info: state.currentQuestion.info || null,
                votersPerAnswer: state.votersPerAnswer || { 0: [], 1: [], 2: [], 3: [] },
                voterIconsConfig: state.voterIconsConfig || {
                    enabled: true,
                    size: 'medium',
                    maxVisible: 10,
                    compactMode: true,
                    animation: 'fade',
                    position: 'above'
                }
            };

            displayQuestion(gameData.question);
            displayAnswers(gameData.answers);
            
            // Update round indicator to show question is ready
            const roundIndicator = document.getElementById('roundIndicator');
            if (roundIndicator) {
                roundIndicator.textContent = 'Aktuelle Frage';
            }

            if (gameData.hiddenAnswers.length > 0) {
                hideAnswers(gameData.hiddenAnswers);
            }
            if (gameData.revealedWrongAnswer !== null) {
                markWrongAnswer(gameData.revealedWrongAnswer);
            }
            
            // Update voter icons during voting phase
            if (gameData.voterIconsConfig.enabled) {
                updateVoterIcons();
            }

            // Update joker info display
            if (state.jokerEvents) {
                updateJokerInfo(state.jokerEvents, state.giftJokerMappings || {});
            }

            if (currentState === States.IDLE || currentState === States.WAIT_NEXT) {
                transitionToState(States.QUESTION_INTRO);
            }
        }
    }

    function handleTimeUpdate(data) {
        gameData.timeRemaining = data.timeRemaining;
        gameData.totalTime = data.totalTime;

        updateTimerDisplay(data.timeRemaining, data.totalTime);

        // Check for state transitions
        if (data.timeRemaining === 0 && currentState === States.RUNNING) {
            transitionToState(States.TIME_UP);
        } else if (data.timeRemaining <= 5 && currentState === States.RUNNING) {
            transitionToState(States.TIME_LOW);
        }
    }

    function handleRoundEnded(data) {
        console.log('Round ended:', data);
        gameData.correctIndex = data.correctAnswer;
        gameData.correctAnswerLetter = data.correctAnswerLetter;
        gameData.correctAnswerText = data.correctAnswerText;
        gameData.info = data.info || null;
        gameData.answerDisplayDuration = data.answerDisplayDuration || 5; // Get from server
        
        // Update voter data from round ended event
        if (data.votersPerAnswer) {
            gameData.votersPerAnswer = data.votersPerAnswer;
        }
        if (data.voterIconsConfig) {
            gameData.voterIconsConfig = data.voterIconsConfig;
        }
        
        // Display final voter icons after TTS
        if (gameData.voterIconsConfig.enabled) {
            setTimeout(() => {
                animateVoterIcons();
            }, 500); // Small delay to sync with TTS
        }

        if (currentState === States.RUNNING || currentState === States.TIME_LOW) {
            transitionToState(States.TIME_UP);
        }
    }

    function handleJokerActivated(joker) {
        console.log('Joker activated:', joker);

        showJokerNotification(joker);

        if (joker.type === '25' && joker.data && joker.data.hiddenAnswers) {
            // 25% joker - hide 1 wrong answer
            animateHideAnswers(joker.data.hiddenAnswers);
        } else if (joker.type === '50' && joker.data && joker.data.hiddenAnswers) {
            animateHideAnswers(joker.data.hiddenAnswers);
        } else if (joker.type === 'info' && joker.data && joker.data.revealedWrongAnswer !== undefined) {
            animateMarkWrongAnswer(joker.data.revealedWrongAnswer);
        } else if (joker.type === 'time' && joker.data) {
            animateTimeBoost();
        }
    }

    function handleQuizStopped() {
        transitionToState(States.IDLE);
    }

    // ============================================
    // DISPLAY FUNCTIONS
    // ============================================

    function showOverlay() {
        const overlay = document.getElementById('overlay-container');
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        const overlay = document.getElementById('overlay-container');
        overlay.classList.add('hidden');
    }

    function displayQuestion(questionText) {
        const questionElement = document.getElementById('questionText');
        questionElement.textContent = questionText;

        // Dynamic font sizing
        const length = questionText.length;
        if (length > 150) {
            questionElement.style.fontSize = '1.5rem';
        } else if (length > 100) {
            questionElement.style.fontSize = '1.8rem';
        } else {
            questionElement.style.fontSize = hudConfig.fonts.sizeQuestion;
        }
    }

    function displayAnswers(answers) {
        // Clear voter icons first when displaying new answers
        clearVoterIcons();
        
        answers.forEach((answer, index) => {
            const element = document.getElementById(`answer${String.fromCharCode(65 + index)}`);
            if (element) {
                element.textContent = answer;

                // Dynamic font sizing
                const length = answer.length;
                if (length > 50) {
                    element.style.fontSize = '0.9rem';
                } else if (length > 30) {
                    element.style.fontSize = '1rem';
                } else {
                    element.style.fontSize = hudConfig.fonts.sizeAnswer;
                }
            }
        });

        // Reset all answer cards
        const cards = document.querySelectorAll('.answer-card');
        cards.forEach(card => {
            card.className = 'answer-card';
        });
    }

    // ============================================
    // TIMER FUNCTIONS
    // ============================================

    function startTimer() {
        const animate = () => {
            if (currentState !== States.RUNNING && currentState !== States.TIME_LOW) return;

            updateTimerDisplay(gameData.timeRemaining, gameData.totalTime);
            timerAnimation = requestAnimationFrame(animate);
        };

        animate();
    }

    function stopTimer() {
        if (timerAnimation) {
            cancelAnimationFrame(timerAnimation);
            timerAnimation = null;
        }
    }

    function updateTimerDisplay(seconds, total) {
        const percentage = seconds / total;

        // Update all timer variants
        updateCircularTimer(seconds, total, percentage);
        updateBarTimer(seconds, total, percentage);
        updateNeonTimer(seconds);
        updateRingTimer(seconds, total, percentage);
    }

    function updateCircularTimer(seconds, total, percentage) {
        const timerValue = document.getElementById('timerValue');
        const timerProgress = document.getElementById('timerProgress');

        if (timerValue) timerValue.textContent = seconds;

        if (timerProgress) {
            const circumference = 2 * Math.PI * 85;
            const offset = circumference * (1 - percentage);
            timerProgress.style.strokeDashoffset = offset;

            // Change color based on remaining time
            if (percentage > 0.5) {
                timerProgress.style.stroke = 'url(#timerGradient)';
                timerProgress.classList.remove('pulse');
            } else if (percentage > 0.2) {
                timerProgress.style.stroke = 'url(#timerGradientWarning)';
                timerProgress.classList.remove('pulse');
            } else {
                timerProgress.style.stroke = 'url(#timerGradientDanger)';
                timerProgress.classList.add('pulse');
            }
        }
    }

    function updateBarTimer(seconds, total, percentage) {
        const timerBarValue = document.getElementById('timerBarValue');
        const timerBarProgress = document.getElementById('timerBarProgress');

        if (timerBarValue) timerBarValue.textContent = seconds;

        if (timerBarProgress) {
            timerBarProgress.style.width = (percentage * 100) + '%';

            // Change color
            if (percentage > 0.5) {
                timerBarProgress.style.background = 'linear-gradient(90deg, var(--color-success), var(--color-primary))';
            } else if (percentage > 0.2) {
                timerBarProgress.style.background = 'linear-gradient(90deg, var(--color-warning), var(--color-primary))';
            } else {
                timerBarProgress.style.background = 'linear-gradient(90deg, var(--color-danger), var(--color-warning))';
            }
        }
    }

    function updateNeonTimer(seconds) {
        const timerNeonValue = document.getElementById('timerNeonValue');
        if (timerNeonValue) {
            timerNeonValue.textContent = seconds;
        }
    }

    function updateRingTimer(seconds, total, percentage) {
        const timerRingValue = document.getElementById('timerRingValue');
        const timerRingProgress = document.getElementById('timerRingProgress');

        if (timerRingValue) timerRingValue.textContent = seconds;

        if (timerRingProgress) {
            const circumference = 2 * Math.PI * 90;
            const offset = circumference * (1 - percentage);
            timerRingProgress.style.strokeDashoffset = offset;
        }
    }

    // ============================================
    // ANIMATION FUNCTIONS
    // ============================================

    function preloadAnimations() {
        const overlay = document.getElementById('overlay-container');
        overlay.style.transform = 'translateZ(0)';
    }

    function animateQuestionIntro() {
        const questionSection = document.getElementById('questionSection');
        const answersSection = document.getElementById('answersSection');
        const timerSection = document.getElementById('timerSection');

        const animClass = `animate-${hudConfig.questionAnimation}`;

        questionSection.classList.add(animClass);
        answersSection.classList.add(animClass);
        timerSection.classList.add(animClass);

        setTimeout(() => {
            questionSection.classList.remove(animClass);
            answersSection.classList.remove(animClass);
            timerSection.classList.remove(animClass);
        }, 1500 / hudConfig.animationSpeed);
    }

    function animateTimeUp() {
        const overlay = document.getElementById('overlay-container');
        overlay.classList.add('time-up-flash');

        setTimeout(() => {
            overlay.classList.remove('time-up-flash');
        }, 500 / hudConfig.animationSpeed);

        // Lock all answers
        const cards = document.querySelectorAll('.answer-card');
        cards.forEach(card => {
            if (!card.classList.contains('hidden-answer')) {
                card.classList.add('locked');
            }
        });

        // Apply color wipe after timeout
        setTimeout(() => {
            cards.forEach((card, index) => {
                if (!card.classList.contains('hidden-answer')) {
                    if (index === gameData.correctIndex) {
                        card.classList.add('color-wipe-green');
                    } else {
                        card.classList.add('color-wipe-red');
                    }
                }
            });
        }, 200);
    }

    function revealCorrectAnswer() {
        if (gameData.correctIndex === null) return;

        const cards = document.querySelectorAll('.answer-card');
        const correctCard = cards[gameData.correctIndex];

        if (correctCard) {
            correctCard.classList.add('correct-answer');

            // Apply selected animation
            const animClass = `anim-${hudConfig.correctAnimation}`;
            correctCard.classList.add(animClass);

            // Show correct reveal overlay with proper info
            const correctReveal = document.getElementById('correctReveal');
            const correctRevealContent = correctReveal.querySelector('.correct-reveal-content');
            
            // Build the popup content
            let popupHTML = `
                <div class="correct-icon">✓</div>
                <div class="correct-text">Richtige Antwort: ${gameData.correctAnswerLetter || String.fromCharCode(65 + gameData.correctIndex)}</div>
            `;
            
            // Add info if available
            if (gameData.info) {
                popupHTML += `<div class="correct-info">${escapeHtml(gameData.info)}</div>`;
            }
            
            correctRevealContent.innerHTML = popupHTML;
            
            correctReveal.classList.remove('hidden');
            correctReveal.classList.add('animate-reveal');

            setTimeout(() => {
                correctReveal.classList.add('hidden');
                correctReveal.classList.remove('animate-reveal');
            }, 2000 / hudConfig.animationSpeed);
        }

        // Mark wrong answers with shake animation
        cards.forEach((card, index) => {
            if (index !== gameData.correctIndex && !card.classList.contains('hidden-answer')) {
                const wrongAnimClass = `anim-${hudConfig.wrongAnimation}`;
                card.classList.add('wrong-answer', wrongAnimClass);

                setTimeout(() => {
                    card.classList.remove(wrongAnimClass);
                }, 500 / hudConfig.animationSpeed);
            }
        });
    }

    // ============================================
    // JOKER FUNCTIONS
    // ============================================

    function showJokerNotification(joker) {
        const notification = document.getElementById('jokerNotification');
        const icon = document.getElementById('jokerIcon');
        const title = document.getElementById('jokerTitle');
        const user = document.getElementById('jokerUser');

        const jokerData = {
            '50': { icon: '✂️', title: '50:50 Joker' },
            'info': { icon: '💡', title: 'Info Joker' },
            'time': { icon: '⏰', title: 'Zeit Joker' }
        };

        const data = jokerData[joker.type] || { icon: '✨', title: 'Joker' };

        icon.textContent = data.icon;
        title.textContent = data.title;
        user.textContent = `von ${joker.username}`;

        notification.classList.remove('hidden');
        notification.classList.add('animate-slide-in');

        setTimeout(() => {
            notification.classList.add('hidden');
            notification.classList.remove('animate-slide-in');
        }, 3000 / hudConfig.animationSpeed);
    }

    function animateHideAnswers(indices) {
        const cards = document.querySelectorAll('.answer-card');

        indices.forEach((index, i) => {
            if (cards[index]) {
                setTimeout(() => {
                    cards[index].classList.add('hidden-answer');
                }, i * 200 / hudConfig.animationSpeed);
            }
        });

        gameData.hiddenAnswers = indices;
    }

    function hideAnswers(indices) {
        const cards = document.querySelectorAll('.answer-card');
        indices.forEach(index => {
            if (cards[index]) {
                cards[index].classList.add('hidden-answer');
            }
        });
    }

    function animateMarkWrongAnswer(index) {
        const cards = document.querySelectorAll('.answer-card');
        if (cards[index]) {
            cards[index].classList.add('wrong-hint');

            setTimeout(() => {
                cards[index].classList.add('reveal-line');
            }, 100);
        }

        gameData.revealedWrongAnswer = index;
    }

    function markWrongAnswer(index) {
        const cards = document.querySelectorAll('.answer-card');
        if (cards[index]) {
            cards[index].classList.add('wrong-hint');
        }
    }

    function animateTimeBoost() {
        const timerSection = document.getElementById('timerSection');
        timerSection.classList.add('time-boost');

        setTimeout(() => {
            timerSection.classList.remove('time-boost');
        }, 1000 / hudConfig.animationSpeed);
    }

    // ============================================
    // MVP DISPLAY
    // ============================================

    function showMVPDisplay(mvp) {
        // Create MVP overlay element if it doesn't exist
        let mvpOverlay = document.getElementById('mvp-overlay');
        if (!mvpOverlay) {
            mvpOverlay = document.createElement('div');
            mvpOverlay.id = 'mvp-overlay';
            mvpOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.5s;
            `;
            document.body.appendChild(mvpOverlay);
        }

        mvpOverlay.innerHTML = `
            <div style="text-align: center; transform: scale(0); transition: transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);">
                <div style="font-size: 4em; margin-bottom: 20px;">👑</div>
                <h1 style="font-size: 3em; color: gold; margin-bottom: 10px; text-shadow: 0 0 20px rgba(255, 215, 0, 0.8);">MVP</h1>
                <h2 style="font-size: 2.5em; color: white; margin-bottom: 10px;">${escapeHtml(mvp.username)}</h2>
                <div style="font-size: 2em; color: #10b981;">
                    <span style="font-weight: bold;">${mvp.points}</span> Punkte
                </div>
            </div>
        `;

        // Animate in
        setTimeout(() => {
            mvpOverlay.style.opacity = '1';
            mvpOverlay.querySelector('div').style.transform = 'scale(1)';
        }, 100);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            mvpOverlay.style.opacity = '0';
            setTimeout(() => {
                if (mvpOverlay.parentNode) {
                    mvpOverlay.parentNode.removeChild(mvpOverlay);
                }
            }, 500);
        }, 5000);
    }

    function showErrorMessage(message) {
        // Create error overlay element if it doesn't exist
        let errorOverlay = document.getElementById('error-overlay');
        if (!errorOverlay) {
            errorOverlay = document.createElement('div');
            errorOverlay.id = 'error-overlay';
            const fontFamily = hudConfig.fonts?.family || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            errorOverlay.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: white;
                padding: 30px 50px;
                border-radius: 15px;
                box-shadow: 0 10px 40px rgba(239, 68, 68, 0.5);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s;
                font-family: ${fontFamily};
                text-align: center;
                border: 3px solid rgba(255, 255, 255, 0.3);
            `;
            document.body.appendChild(errorOverlay);
        }

        errorOverlay.innerHTML = `
            <div class="error-content" style="transform: scale(0); transition: transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);">
                <div style="font-size: 3em; margin-bottom: 15px;">⚠️</div>
                <h2 style="font-size: 2em; margin-bottom: 10px; font-weight: bold;">${escapeHtml(message)}</h2>
                <p style="font-size: 1.2em; opacity: 0.9;">Bitte fügen Sie neue Fragen hinzu und starten Sie erneut.</p>
            </div>
        `;

        // Animate in
        setTimeout(() => {
            errorOverlay.style.opacity = '1';
            const content = errorOverlay.querySelector('.error-content');
            if (content) {
                content.style.transform = 'scale(1)';
            }
        }, 100);

        // Auto-hide after 8 seconds
        setTimeout(() => {
            errorOverlay.style.opacity = '0';
            setTimeout(() => {
                errorOverlay.remove();
            }, 300);
        }, 8000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // BRAND KIT
    // ============================================

    function applyBrandKit(brandKit) {
        if (!brandKit) return;

        const overlay = document.getElementById('overlay-container');
        const root = document.documentElement;

        // Apply branded theme if colors are set
        if (brandKit.primary_color || brandKit.secondary_color) {
            overlay.setAttribute('data-theme', 'branded');
            
            if (brandKit.primary_color) {
                root.style.setProperty('--brand-primary', brandKit.primary_color);
                root.style.setProperty('--color-primary', brandKit.primary_color);
            }
            
            if (brandKit.secondary_color) {
                root.style.setProperty('--brand-secondary', brandKit.secondary_color);
                root.style.setProperty('--color-secondary', brandKit.secondary_color);
            }
        }

        // Apply logo if set
        if (brandKit.logo_path) {
            let logoElement = document.getElementById('brand-logo');
            if (!logoElement) {
                logoElement = document.createElement('img');
                logoElement.id = 'brand-logo';
                logoElement.style.cssText = `
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    max-width: 150px;
                    max-height: 80px;
                    z-index: 100;
                `;
                overlay.appendChild(logoElement);
            }
            logoElement.src = brandKit.logo_path;
        }
    }

    // ============================================
    // VOTER ICONS SYSTEM
    // ============================================

    function updateVoterIcons() {
        if (!gameData.voterIconsConfig.enabled) return;
        
        // Update icons for each answer during voting phase (non-animated)
        for (let i = 0; i < 4; i++) {
            const container = document.querySelector(`.voter-icons-container[data-answer="${i}"]`);
            if (!container) continue;
            
            const voters = gameData.votersPerAnswer[i] || [];
            renderVoterIcons(container, voters, false);
        }
    }

    function animateVoterIcons() {
        if (!gameData.voterIconsConfig.enabled) return;
        
        // Animate icons when revealing correct answer
        for (let i = 0; i < 4; i++) {
            const container = document.querySelector(`.voter-icons-container[data-answer="${i}"]`);
            if (!container) continue;
            
            const voters = gameData.votersPerAnswer[i] || [];
            renderVoterIcons(container, voters, true);
        }
    }

    function renderVoterIcons(container, voters, animate = false) {
        const config = gameData.voterIconsConfig;
        
        // Clear previous icons
        container.innerHTML = '';
        
        if (!voters || voters.length === 0) {
            container.classList.remove('has-voters');
            return;
        }
        
        container.classList.add('has-voters');
        
        // Determine icon size
        const sizeMap = {
            small: '24px',
            medium: '32px',
            large: '40px'
        };
        const iconSize = sizeMap[config.size] || '32px';
        
        // Limit visible icons
        const maxVisible = config.maxVisible || 10;
        const visibleVoters = voters.slice(0, maxVisible);
        const overflowCount = voters.length - maxVisible;
        
        // Create icon wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'voter-icons-wrapper';
        wrapper.style.setProperty('--icon-size', iconSize);
        
        // Add position class
        if (config.position) {
            wrapper.classList.add(`position-${config.position}`);
        }
        
        // Add animation class
        if (animate && config.animation) {
            wrapper.classList.add(`animate-${config.animation}`);
        }
        
        // Compact mode for many voters
        if (config.compactMode && voters.length > 5) {
            wrapper.classList.add('compact-mode');
        }
        
        // Render voter avatars
        visibleVoters.forEach((voter, index) => {
            const icon = createVoterIcon(voter, index, animate);
            wrapper.appendChild(icon);
        });
        
        // Add overflow indicator if needed
        if (overflowCount > 0) {
            const overflow = document.createElement('div');
            overflow.className = 'voter-icon overflow-indicator';
            overflow.textContent = `+${overflowCount}`;
            overflow.style.animationDelay = animate ? `${visibleVoters.length * 0.05}s` : '0s';
            wrapper.appendChild(overflow);
        }
        
        container.appendChild(wrapper);
    }

    function createVoterIcon(voter, index, animate) {
        const icon = document.createElement('div');
        icon.className = 'voter-icon';
        icon.title = voter.username || 'Anonymous';
        
        // Add animation delay for staggered appearance
        if (animate) {
            icon.style.animationDelay = `${index * 0.05}s`;
        }
        
        // Create avatar image
        if (voter.profilePictureUrl) {
            const img = document.createElement('img');
            img.src = voter.profilePictureUrl;
            img.alt = voter.username || 'User';
            img.className = 'voter-avatar';
            
            // Handle image load error
            img.addEventListener('error', () => {
                icon.classList.add('no-image');
                icon.textContent = getInitials(voter.username);
            });
            
            icon.appendChild(img);
        } else {
            // Fallback to initials
            icon.classList.add('no-image');
            icon.textContent = getInitials(voter.username);
        }
        
        return icon;
    }

    function getInitials(username) {
        if (!username) return '?';
        
        const parts = username.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return username.substring(0, 2).toUpperCase();
    }

    function clearVoterIcons() {
        const containers = document.querySelectorAll('.voter-icons-container');
        containers.forEach(container => {
            container.innerHTML = '';
            container.classList.remove('has-voters');
        });
    }

    // ============================================
    // LEADERBOARD DISPLAY
    // ============================================

    function handleShowLeaderboard(data) {
        try {
            const { leaderboard, displayType, animationStyle } = data;
            
            if (!leaderboard || leaderboard.length === 0) {
                console.log('No leaderboard data to display');
                return;
            }

            const leaderboardOverlay = document.getElementById('leaderboardOverlay');
            const leaderboardList = document.getElementById('leaderboardList');
            const leaderboardType = document.getElementById('leaderboardType');

            if (!leaderboardOverlay || !leaderboardList || !leaderboardType) {
                console.error('Leaderboard elements not found');
                return;
            }

            // Set display type
            leaderboardType.textContent = displayType === 'round' ? 'Runde' : displayType === 'season' ? 'Season' : 'Runde + Season';

            // Clear existing entries
            leaderboardList.innerHTML = '';

            // Create leaderboard entries
            leaderboard.forEach((entry, index) => {
                const li = document.createElement('li');
                li.className = 'leaderboard-entry';

                const rank = document.createElement('div');
                rank.className = `leaderboard-rank rank-${index + 1}`;
                rank.textContent = `#${index + 1}`;

                const username = document.createElement('div');
                username.className = 'leaderboard-username';
                username.textContent = entry.username || 'Unknown';

                const points = document.createElement('div');
                points.className = 'leaderboard-points';
                points.textContent = `${entry.points || 0} Pkt`;

                li.appendChild(rank);
                li.appendChild(username);
                li.appendChild(points);
                leaderboardList.appendChild(li);
            });

            // Set animation style
            leaderboardOverlay.setAttribute('data-animation', animationStyle || 'fade');

            // Show leaderboard
            leaderboardOverlay.classList.remove('hidden');

            console.log('Leaderboard displayed:', displayType);
        } catch (error) {
            console.error('Error displaying leaderboard:', error);
        }
    }

    function handleHideLeaderboard() {
        try {
            const leaderboardOverlay = document.getElementById('leaderboardOverlay');
            if (leaderboardOverlay) {
                leaderboardOverlay.classList.add('hidden');
            }
            console.log('Leaderboard hidden');
        } catch (error) {
            console.error('Error hiding leaderboard:', error);
        }
    }

    function handleLeaderboardUpdated(data) {
        try {
            // If leaderboard is currently visible, update it
            const leaderboardOverlay = document.getElementById('leaderboardOverlay');
            if (leaderboardOverlay && !leaderboardOverlay.classList.contains('hidden')) {
                handleShowLeaderboard(data);
            }
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }

    // ============================================
    // JOKER INFO DISPLAY
    // ============================================

    function updateJokerInfo(jokerEvents, giftJokerMappings) {
        try {
            const jokerInfoOverlay = document.getElementById('jokerInfoOverlay');
            const jokerList = document.getElementById('jokerList');

            if (!jokerInfoOverlay || !jokerList) {
                return;
            }

            // Clear existing jokers
            jokerList.innerHTML = '';

            // Define available jokers
            const availableJokers = [
                { type: '25', label: '25% Joker', icon: '🎯', used: false },
                { type: '50', label: '50:50 Joker', icon: '⚖️', used: false },
                { type: 'info', label: 'Info Joker', icon: 'ℹ️', used: false },
                { type: 'time', label: 'Zeit Joker', icon: '⏱️', used: false }
            ];

            // Mark used jokers
            jokerEvents.forEach(event => {
                const joker = availableJokers.find(j => j.type === event.type);
                if (joker) {
                    joker.used = true;
                    joker.giftActivated = event.isGiftActivated;
                    joker.giftIcon = event.giftIcon;
                }
            });

            // Create joker items
            availableJokers.forEach(joker => {
                const item = document.createElement('div');
                item.className = `joker-item ${joker.used ? 'used' : ''}`;
                if (joker.used && joker.giftActivated) {
                    item.classList.add('activated');
                }

                const icon = document.createElement('div');
                icon.className = 'joker-icon';
                
                if (joker.used && joker.giftActivated && joker.giftIcon) {
                    const img = document.createElement('img');
                    img.src = joker.giftIcon;
                    img.className = 'joker-gift-icon';
                    img.alt = joker.label;
                    icon.appendChild(img);
                } else {
                    icon.textContent = joker.icon;
                }

                const label = document.createElement('div');
                label.className = 'joker-label';
                label.textContent = joker.label;

                item.appendChild(icon);
                item.appendChild(label);
                jokerList.appendChild(item);
            });

            // Show joker info if there are joker events
            if (jokerEvents.length > 0) {
                jokerInfoOverlay.classList.remove('hidden');
            } else {
                jokerInfoOverlay.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error updating joker info:', error);
        }
    }

    // ============================================
    // CUSTOM LAYOUT SUPPORT
    // ============================================

    function handleLayoutUpdated(data) {
        try {
            const { layout, customLayoutEnabled } = data;

            if (!customLayoutEnabled || !layout) {
                // Disable custom layout
                document.getElementById('overlay-container').removeAttribute('data-custom-layout');
                return;
            }

            const overlayContainer = document.getElementById('overlay-container');
            overlayContainer.setAttribute('data-custom-layout', 'true');

            // Apply layout configuration via CSS variables
            const config = typeof layout.layout_config === 'string' 
                ? JSON.parse(layout.layout_config) 
                : layout.layout_config;

            const root = document.documentElement;

            // Question section
            if (config.question) {
                root.style.setProperty('--question-top', `${config.question.y}px`);
                root.style.setProperty('--question-left', `${config.question.x}px`);
                root.style.setProperty('--question-width', `${config.question.width}px`);
                root.style.setProperty('--question-height', `${config.question.height}px`);
            }

            // Answers section
            if (config.answers) {
                root.style.setProperty('--answers-top', `${config.answers.y}px`);
                root.style.setProperty('--answers-left', `${config.answers.x}px`);
                root.style.setProperty('--answers-width', `${config.answers.width}px`);
                root.style.setProperty('--answers-height', `${config.answers.height}px`);
            }

            // Timer section
            if (config.timer) {
                root.style.setProperty('--timer-top', `${config.timer.y}px`);
                root.style.setProperty('--timer-left', `${config.timer.x}px`);
                root.style.setProperty('--timer-width', `${config.timer.width}px`);
                root.style.setProperty('--timer-height', `${config.timer.height}px`);
            }

            // Leaderboard
            if (config.leaderboard) {
                root.style.setProperty('--leaderboard-top', `${config.leaderboard.y}px`);
                root.style.setProperty('--leaderboard-left', `${config.leaderboard.x}px`);
                root.style.setProperty('--leaderboard-width', `${config.leaderboard.width}px`);
                root.style.setProperty('--leaderboard-height', `${config.leaderboard.height}px`);
            }

            // Joker info
            if (config.jokerInfo) {
                root.style.setProperty('--joker-info-top', `${config.jokerInfo.y}px`);
                root.style.setProperty('--joker-info-left', `${config.jokerInfo.x}px`);
                root.style.setProperty('--joker-info-width', `${config.jokerInfo.width}px`);
                root.style.setProperty('--joker-info-height', `${config.jokerInfo.height}px`);
            }

            console.log('Custom layout applied:', layout.name);
        } catch (error) {
            console.error('Error applying custom layout:', error);
        }
    }

    // ============================================
    // CLEANUP
    // ============================================

    window.addEventListener('beforeunload', () => {
        if (timerAnimation) {
            cancelAnimationFrame(timerAnimation);
        }
        if (stateTimeout) {
            clearTimeout(stateTimeout);
        }
    });

    console.log('Quiz Show Overlay loaded successfully');
})();
