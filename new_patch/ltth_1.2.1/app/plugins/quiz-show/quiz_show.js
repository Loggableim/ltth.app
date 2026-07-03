// Quiz Show Plugin - Client Side JavaScript
(function() {
    'use strict';

    // Socket.IO connection
    const socket = io();

    // State
    let currentState = {
        config: {},
        questions: [],
        leaderboard: [],
        packages: [],
        hasOpenAIKey: false,
        gameState: {},
        stats: {}
    };

    let editingQuestionId = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        initializeTabs();
        initializeEventListeners();
        initializeSocketListeners();
        initializeCategoryFilterDropdown();
        loadInitialState();
        loadTTSVoices(); // Load available TTS voices
    });

    // Tab Navigation
    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;

                // Remove active class from all
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Add active class to selected
                button.classList.add('active');
                const tabContent = document.getElementById(tabName);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
            });
        });
    }

    // Event Listeners
    function initializeEventListeners() {
        // Safe event listener helper
        const addListener = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        };

        // Dashboard controls
        addListener('startQuizBtn', 'click', startQuiz);
        addListener('nextQuestionBtn', 'click', nextQuestion);
        addListener('stopQuizBtn', 'click', stopQuiz);

        // Question management
        addListener('addQuestionBtn', 'click', addQuestion);
        addListener('updateQuestionBtn', 'click', updateQuestion);
        addListener('cancelEditBtn', 'click', cancelEdit);
        addListener('uploadQuestionsBtn', 'click', uploadQuestions);
        addListener('exportQuestionsBtn', 'click', exportQuestions);

        // AI Packages
        // Note: OpenAI config is now managed in main settings panel
        addListener('generatePackageBtn', 'click', generateQuestionPackage);

        // Settings
        addListener('saveSettingsBtn', 'click', saveSettings);

        // Leaderboard
        addListener('exportLeaderboardBtn', 'click', exportLeaderboard);
        addListener('importLeaderboardBtn', 'click', () => {
            const modal = document.getElementById('importModal');
            if (modal) modal.classList.remove('hidden');
        });
        addListener('resetLeaderboardBtn', 'click', resetLeaderboard);
        addListener('newSeasonBtn', 'click', createNewSeason);
        addListener('seasonSelect', 'change', (e) => loadSeasonLeaderboard(e.target.value));

        // Import modal
        addListener('confirmImportBtn', 'click', importLeaderboard);
        addListener('cancelImportBtn', 'click', () => {
            const modal = document.getElementById('importModal');
            if (modal) modal.classList.add('hidden');
        });

        const modalClose = document.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                const modal = document.getElementById('importModal');
                if (modal) modal.classList.add('hidden');
            });
        }

        // Load AI packages tab when opened
        const aiPackagesTab = document.querySelector('[data-tab="ai-packages"]');
        if (aiPackagesTab) {
            aiPackagesTab.addEventListener('click', () => {
                setTimeout(() => {
                    loadOpenAIConfig();
                    loadPackages();
                }, 100);
            });
        }

        // Event delegation for dynamically created buttons
        document.addEventListener('click', (e) => {
            // Question actions
            let btn = e.target.closest('.btn-edit-question');
            if (btn) {
                const questionId = parseInt(btn.dataset.questionId);
                editQuestion(questionId);
                return;
            }
            btn = e.target.closest('.btn-delete-question');
            if (btn) {
                const questionId = parseInt(btn.dataset.questionId);
                deleteQuestion(questionId);
                return;
            }
            // Package actions
            btn = e.target.closest('.btn-view-package');
            if (btn) {
                const packageId = parseInt(btn.dataset.packageId);
                viewPackageQuestions(packageId);
                return;
            }
            btn = e.target.closest('.btn-delete-package');
            if (btn) {
                const packageId = parseInt(btn.dataset.packageId);
                deletePackage(packageId);
                return;
            }
            // Layout actions
            btn = e.target.closest('.btn-activate-layout');
            if (btn) {
                const layoutId = parseInt(btn.dataset.layoutId);
                activateLayout(layoutId);
                return;
            }
            btn = e.target.closest('.btn-deactivate-layout');
            if (btn) {
                deactivateLayout();
                return;
            }
            btn = e.target.closest('.btn-edit-layout');
            if (btn) {
                const layoutId = parseInt(btn.dataset.layoutId);
                editLayout(layoutId);
                return;
            }
            btn = e.target.closest('.btn-delete-layout');
            if (btn) {
                const layoutId = parseInt(btn.dataset.layoutId);
                deleteLayout(layoutId);
                return;
            }
            // Gift joker actions
            btn = e.target.closest('.btn-edit-gift-joker');
            if (btn) {
                const giftId = parseInt(btn.dataset.giftId);
                editGiftJoker(giftId);
                return;
            }
            btn = e.target.closest('.btn-delete-gift-joker');
            if (btn) {
                const giftId = parseInt(btn.dataset.giftId);
                deleteGiftJoker(giftId);
                return;
            }
        });

        // Event delegation for package toggle checkboxes
        document.addEventListener('change', (e) => {
            const checkbox = e.target.closest('.package-toggle-checkbox');
            if (checkbox) {
                const packageId = parseInt(checkbox.dataset.packageId);
                togglePackage(packageId);
            }
        });

        document.addEventListener('keydown', handleDashboardHotkeys);
    }

    // Socket.IO Listeners
    function initializeSocketListeners() {
        socket.on('connect', () => {
            const status = document.getElementById('connectionStatus');
            if (status) {
                status.textContent = 'Verbunden';
                status.className = 'status-badge status-connected';
            }
        });

        socket.on('disconnect', () => {
            const status = document.getElementById('connectionStatus');
            if (status) {
                status.textContent = 'Getrennt';
                status.className = 'status-badge status-error';
            }
        });

        socket.on('quiz-show:state-update', handleStateUpdate);
        socket.on('quiz-show:time-update', handleTimeUpdate);
        socket.on('quiz-show:round-ended', handleRoundEnded);
        socket.on('quiz-show:answer-received', handleAnswerReceived);
        socket.on('quiz-show:joker-activated', handleJokerActivated);
        socket.on('quiz-show:leaderboard-updated', handleLeaderboardUpdate);
        socket.on('quiz-show:questions-updated', handleQuestionsUpdate);
        socket.on('quiz-show:config-updated', handleConfigUpdate);
        socket.on('quiz-show:stopped', handleQuizStopped);
        socket.on('quiz-show:error', handleError);
    }

    // Load Initial State
    async function loadInitialState() {
        try {
            const response = await fetch('/api/quiz-show/state');
            const data = await response.json();

            if (data.success) {
                currentState = data;
                updateUI();
                loadCategories();
                loadSeasons();
            }
        } catch (error) {
            console.error('Error loading state:', error);
            showMessage('Fehler beim Laden des Status', 'error');
        }
    }

    // Dashboard Functions
    async function startQuiz() {
        await syncCategoryFilter();
        socket.emit('quiz-show:start');
    }

    async function nextQuestion() {
        await syncCategoryFilter();
        socket.emit('quiz-show:next');
    }

    function stopQuiz() {
        if (confirm('Quiz wirklich stoppen?')) {
            socket.emit('quiz-show:stop');
        }
    }

    // Question Management
    async function addQuestion() {
        const question = document.getElementById('questionInput').value.trim();
        const answers = [
            document.getElementById('answerA').value.trim(),
            document.getElementById('answerB').value.trim(),
            document.getElementById('answerC').value.trim(),
            document.getElementById('answerD').value.trim()
        ];
        const correct = parseInt(document.getElementById('correctAnswer').value);
        const category = document.getElementById('questionCategory').value.trim() || 'Allgemein';
        const difficulty = parseInt(document.getElementById('questionDifficulty').value);
        const info = document.getElementById('questionInfo').value.trim() || null;

        if (!question || answers.some(a => !a)) {
            alert('Bitte alle Felder ausfüllen');
            return;
        }

        try {
            const response = await fetch('/api/quiz-show/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answers, correct, category, difficulty, info })
            });

            const data = await response.json();

            if (data.success) {
                clearQuestionForm();
                showMessage('Frage hinzugefügt', 'success');
                loadCategories(); // Refresh categories
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error adding question:', error);
            showMessage('Fehler beim Hinzufügen', 'error');
        }
    }

    async function updateQuestion() {
        if (!editingQuestionId) return;

        const question = document.getElementById('questionInput').value.trim();
        const answers = [
            document.getElementById('answerA').value.trim(),
            document.getElementById('answerB').value.trim(),
            document.getElementById('answerC').value.trim(),
            document.getElementById('answerD').value.trim()
        ];
        const correct = parseInt(document.getElementById('correctAnswer').value);
        const category = document.getElementById('questionCategory').value.trim() || 'Allgemein';
        const difficulty = parseInt(document.getElementById('questionDifficulty').value);
        const info = document.getElementById('questionInfo').value.trim() || null;

        if (!question || answers.some(a => !a)) {
            alert('Bitte alle Felder ausfüllen');
            return;
        }

        try {
            const response = await fetch(`/api/quiz-show/questions/${editingQuestionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answers, correct, category, difficulty, info })
            });

            const data = await response.json();

            if (data.success) {
                clearQuestionForm();
                cancelEdit();
                showMessage('Frage aktualisiert', 'success');
                loadCategories(); // Refresh categories
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error updating question:', error);
            showMessage('Fehler beim Aktualisieren', 'error');
        }
    }

    function editQuestion(questionId) {
        const question = currentState.questions.find(q => q.id === questionId);
        if (!question) return;

        editingQuestionId = questionId;

        document.getElementById('questionInput').value = question.question;
        document.getElementById('answerA').value = question.answers[0];
        document.getElementById('answerB').value = question.answers[1];
        document.getElementById('answerC').value = question.answers[2];
        document.getElementById('answerD').value = question.answers[3];
        document.getElementById('correctAnswer').value = question.correct;
        document.getElementById('questionCategory').value = question.category || 'Allgemein';
        document.getElementById('questionDifficulty').value = question.difficulty || 2;
        document.getElementById('questionInfo').value = question.info || '';

        document.getElementById('addQuestionBtn').classList.add('hidden');
        document.getElementById('updateQuestionBtn').classList.remove('hidden');
        document.getElementById('cancelEditBtn').classList.remove('hidden');

        // Scroll to editor
        document.querySelector('#questions .panel').scrollIntoView({ behavior: 'smooth' });
    }

    async function deleteQuestion(questionId) {
        if (!confirm('Frage wirklich löschen?')) return;

        try {
            const response = await fetch(`/api/quiz-show/questions/${questionId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Frage gelöscht', 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting question:', error);
            showMessage('Fehler beim Löschen', 'error');
        }
    }

    function cancelEdit() {
        editingQuestionId = null;
        clearQuestionForm();

        document.getElementById('addQuestionBtn').classList.remove('hidden');
        document.getElementById('updateQuestionBtn').classList.add('hidden');
        document.getElementById('cancelEditBtn').classList.add('hidden');
    }

    function clearQuestionForm() {
        document.getElementById('questionInput').value = '';
        document.getElementById('answerA').value = '';
        document.getElementById('answerB').value = '';
        document.getElementById('answerC').value = '';
        document.getElementById('answerD').value = '';
        document.getElementById('correctAnswer').value = '0';
        document.getElementById('questionCategory').value = 'Allgemein';
        document.getElementById('questionDifficulty').value = '2';
        document.getElementById('questionInfo').value = '';
    }

    async function uploadQuestions() {
        const jsonText = document.getElementById('jsonUpload').value.trim();

        if (!jsonText) {
            alert('Bitte JSON eingeben');
            return;
        }

        try {
            const questions = JSON.parse(jsonText);

            const response = await fetch('/api/quiz-show/questions/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(questions)
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('jsonUpload').value = '';
                showMessage(`${data.added} Fragen hochgeladen`, 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error uploading questions:', error);
            alert('Ungültiges JSON Format');
        }
    }

    async function exportQuestions() {
        try {
            const response = await fetch('/api/quiz-show/questions/export');
            const questions = await response.json();

            const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quiz-questions.json';
            a.click();
            URL.revokeObjectURL(url);

            showMessage('Fragen exportiert', 'success');
        } catch (error) {
            console.error('Error exporting questions:', error);
            showMessage('Fehler beim Exportieren', 'error');
        }
    }

    async function updateConfigPartial(patch) {
        try {
            const response = await fetch('/api/quiz-show/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
            });

            const data = await response.json();
            if (data.success) {
                currentState.config = data.config || { ...currentState.config, ...patch };
                return true;
            }
        } catch (error) {
            console.error('Error updating quiz config:', error);
        }
        return false;
    }

    async function syncCategoryFilter() {
        const categories = getSelectedCategories();
        await updateConfigPartial({ categoryFilter: categories });
    }

    async function updateAutoModeSetting(enabled) {
        const checkbox = document.getElementById('autoMode');
        if (checkbox) {
            checkbox.checked = enabled;
        }
        await updateConfigPartial({ autoMode: enabled });
    }

    // Settings
    async function saveSettings() {
        const config = {
            roundDuration: parseInt(document.getElementById('roundDuration').value),
            pointsFirstCorrect: parseInt(document.getElementById('pointsFirstCorrect').value),
            pointsOtherCorrect: parseInt(document.getElementById('pointsOtherCorrect').value),
            multipleWinners: document.getElementById('multipleWinners').checked,
            showAnswersAfterTime: document.getElementById('showAnswersAfterTime').checked,
            shuffleAnswers: document.getElementById('shuffleAnswers').checked,
            randomQuestions: document.getElementById('randomQuestions').checked,
            totalRounds: parseInt(document.getElementById('totalRounds').value),
            showRoundNumber: document.getElementById('showRoundNumber').checked,
            joker50Enabled: document.getElementById('joker50Enabled').checked,
            jokerInfoEnabled: document.getElementById('jokerInfoEnabled').checked,
            jokerTimeEnabled: document.getElementById('jokerTimeEnabled').checked,
            jokerTimeBoost: parseInt(document.getElementById('jokerTimeBoost').value),
            jokersPerRound: parseInt(document.getElementById('jokersPerRound').value),
            ttsEnabled: document.getElementById('ttsEnabled').checked,
            ttsVoice: document.getElementById('ttsVoice').value,
            ttsVolume: parseInt(document.getElementById('ttsVolume').value),
            ttsSpeed: parseFloat(document.getElementById('ttsSpeed').value),
            ttsStartDelay: parseInt(document.getElementById('ttsStartDelay').value),
            marathonLength: parseInt(document.getElementById('marathonLength').value),
            gameMode: document.getElementById('gameModeSelect').value,
            categoryFilter: getSelectedCategories(), // Now returns an array
            autoMode: document.getElementById('autoMode').checked,
            autoModeDelay: parseInt(document.getElementById('autoModeDelay').value),
            autoRestartRound: document.getElementById('autoRestartRound').checked,
            answerDisplayDuration: Math.max(6, parseInt(document.getElementById('answerDisplayDuration').value)), // Minimum 6 seconds
            // Voter Icons Settings
            voterIconsEnabled: document.getElementById('voterIconsEnabled').checked,
            voterIconSize: document.getElementById('voterIconSize').value,
            voterIconMaxVisible: parseInt(document.getElementById('voterIconMaxVisible').value),
            voterIconCompactMode: document.getElementById('voterIconCompactMode').checked,
            voterIconAnimation: document.getElementById('voterIconAnimation').value,
            voterIconPosition: document.getElementById('voterIconPosition').value,
            voterIconShowOnScoreboard: document.getElementById('voterIconShowOnScoreboard').checked,
            // NEW: Chat Command Settings
            allowPlainLetters: document.getElementById('allowPlainLetters').checked,
            allowExclamation: document.getElementById('allowExclamation').checked,
            allowSlash: document.getElementById('allowSlash').checked,
            allowFullText: document.getElementById('allowFullText').checked,
            jokerCommandPrefix: document.getElementById('jokerCommandPrefix').value,
            jokerSuperfanOnly: document.getElementById('jokerSuperfanOnly').checked,
            answerPermissionLevel: document.getElementById('answerPermissionLevel').value,
            useGCCE: document.getElementById('useGCCE').checked
        };

        try {
            // Save main config
            const response = await fetch('/api/quiz-show/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const data = await response.json();

            // OpenAI config is now managed in main settings panel (no longer saved here)

            if (data.success) {
                showMessage('Einstellungen gespeichert', 'success', 'saveMessage');
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'saveMessage');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showMessage('Fehler beim Speichern', 'error', 'saveMessage');
        }
    }

    async function saveOpenAIConfigFromSettings() {
        // Deprecated - OpenAI config is now in main settings
        return true;
    }

    // Leaderboard
    async function exportLeaderboard() {
        try {
            const response = await fetch('/api/quiz-show/leaderboard/export');
            const leaderboard = await response.json();

            const blob = new Blob([JSON.stringify(leaderboard, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quiz-leaderboard.json';
            a.click();
            URL.revokeObjectURL(url);

            showMessage('Leaderboard exportiert', 'success');
        } catch (error) {
            console.error('Error exporting leaderboard:', error);
            showMessage('Fehler beim Exportieren', 'error');
        }
    }

    async function importLeaderboard() {
        const jsonText = document.getElementById('importLeaderboardJson').value.trim();

        if (!jsonText) {
            alert('Bitte JSON eingeben');
            return;
        }

        try {
            const leaderboard = JSON.parse(jsonText);

            const response = await fetch('/api/quiz-show/leaderboard/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leaderboard)
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('importModal').classList.add('hidden');
                document.getElementById('importLeaderboardJson').value = '';
                showMessage(`${data.entries} Einträge importiert`, 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error importing leaderboard:', error);
            alert('Ungültiges JSON Format');
        }
    }

    async function resetLeaderboard() {
        if (!confirm('Leaderboard wirklich zurücksetzen? Alle Punkte gehen verloren!')) {
            return;
        }

        try {
            const response = await fetch('/api/quiz-show/leaderboard/reset', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Leaderboard zurückgesetzt', 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error resetting leaderboard:', error);
            showMessage('Fehler beim Zurücksetzen', 'error');
        }
    }

    // Socket Event Handlers
    function handleStateUpdate(state) {
        currentState.gameState = state;

        // Update UI
        if (state.isRunning) {
            document.getElementById('quizStatus').textContent = 'Läuft';
            document.getElementById('quizStatus').className = 'status-badge status-running';

            document.getElementById('startQuizBtn').disabled = true;
            document.getElementById('nextQuestionBtn').disabled = false;
            document.getElementById('stopQuizBtn').disabled = false;

            displayCurrentQuestion(state.currentQuestion);
            showTimer(state.timeRemaining, state.totalTime);
        }

        updateAnswerCount(state.answerCount || 0);
    }

    function handleTimeUpdate(data) {
        updateTimer(data.timeRemaining, data.totalTime);
    }

    function handleRoundEnded(data) {
        document.getElementById('quizStatus').textContent = 'Runde beendet';
        document.getElementById('quizStatus').className = 'status-badge status-idle';

        // Keep buttons active - user can still stop or continue to next question
        document.getElementById('startQuizBtn').disabled = true;
        document.getElementById('nextQuestionBtn').disabled = false;
        document.getElementById('stopQuizBtn').disabled = false;

        // Show correct answer
        highlightCorrectAnswer(data.correctAnswer.index);

        // Update statistics
        if (data.stats) {
            currentState.stats = data.stats;
            updateStatistics();
        }

        // Show results notification
        const correctCount = data.results.correctUsers.length;
        const totalCount = data.results.totalAnswers;
        showMessage(`Runde beendet: ${correctCount}/${totalCount} richtige Antworten`, 'success');
    }

    function handleAnswerReceived(data) {
        updateAnswerCount(data.totalAnswers);
    }

    function handleJokerActivated(joker) {
        addJokerEvent(joker);

        // Visual feedback
        if (joker.type === '50') {
            hideAnswers(joker.data.hiddenAnswers);
        } else if (joker.type === 'info') {
            markWrongAnswer(joker.data.revealedWrongAnswer);
        }
    }

    function handleLeaderboardUpdate(leaderboard) {
        currentState.leaderboard = leaderboard;
        updateLeaderboardTable();
    }

    function handleQuestionsUpdate(questions) {
        currentState.questions = questions;
        updateQuestionsList();
    }

    function handleConfigUpdate(config) {
        currentState.config = config;
        updateSettingsForm();
    }

    function handleQuizStopped() {
        document.getElementById('quizStatus').textContent = 'Gestoppt';
        document.getElementById('quizStatus').className = 'status-badge status-idle';

        document.getElementById('startQuizBtn').disabled = false;
        document.getElementById('nextQuestionBtn').disabled = true;
        document.getElementById('stopQuizBtn').disabled = true;

        hideQuestion();
        hideTimer();
    }

    function handleError(error) {
        showMessage('Fehler: ' + error.message, 'error');
    }

    // UI Update Functions
    function updateUI() {
        updateSettingsForm();
        updateQuestionsList();
        updateLeaderboardTable();
        updateStatistics();
    }

    function updateSettingsForm() {
        const config = currentState.config;

        document.getElementById('roundDuration').value = config.roundDuration || 30;
        document.getElementById('pointsFirstCorrect').value = config.pointsFirstCorrect || 100;
        document.getElementById('pointsOtherCorrect').value = config.pointsOtherCorrect || 50;
        document.getElementById('multipleWinners').checked = config.multipleWinners !== false;
        document.getElementById('showAnswersAfterTime').checked = config.showAnswersAfterTime || false;
        document.getElementById('shuffleAnswers').checked = config.shuffleAnswers || false;
        document.getElementById('randomQuestions').checked = config.randomQuestions !== false;
        document.getElementById('totalRounds').value = config.totalRounds || 10;
        document.getElementById('showRoundNumber').checked = config.showRoundNumber !== false;
        document.getElementById('joker50Enabled').checked = config.joker50Enabled !== false;
        document.getElementById('jokerInfoEnabled').checked = config.jokerInfoEnabled !== false;
        document.getElementById('jokerTimeEnabled').checked = config.jokerTimeEnabled !== false;
        document.getElementById('jokerTimeBoost').value = config.jokerTimeBoost || 15;
        document.getElementById('jokersPerRound').value = config.jokersPerRound || 3;
        document.getElementById('ttsEnabled').checked = config.ttsEnabled || false;
        document.getElementById('ttsVoice').value = config.ttsVoice || 'default';
        document.getElementById('ttsVolume').value = config.ttsVolume || 80;
        document.getElementById('ttsSpeed').value = config.ttsSpeed || 1.0;
        document.getElementById('ttsStartDelay').value = config.ttsStartDelay || 2;
        document.getElementById('marathonLength').value = config.marathonLength || 15;
        document.getElementById('gameModeSelect').value = config.gameMode || 'classic';
        // categoryFilter now handled by setSelectedCategories
        setSelectedCategories(config.categoryFilter || ['Alle']);
        document.getElementById('autoMode').checked = config.autoMode || false;
        document.getElementById('autoModeDelay').value = config.autoModeDelay || 5;
        document.getElementById('autoRestartRound').checked = config.autoRestartRound !== false;
        document.getElementById('answerDisplayDuration').value = Math.max(6, config.answerDisplayDuration || 6); // Minimum 6 seconds
        
        // Voter Icons Settings
        document.getElementById('voterIconsEnabled').checked = config.voterIconsEnabled !== false;
        document.getElementById('voterIconSize').value = config.voterIconSize || 'medium';
        document.getElementById('voterIconMaxVisible').value = config.voterIconMaxVisible || 10;
        document.getElementById('voterIconCompactMode').checked = config.voterIconCompactMode !== false;
        document.getElementById('voterIconAnimation').value = config.voterIconAnimation || 'fade';
        document.getElementById('voterIconPosition').value = config.voterIconPosition || 'above';
        document.getElementById('voterIconShowOnScoreboard').checked = config.voterIconShowOnScoreboard || false;
        
        // NEW: Chat Command Settings
        document.getElementById('allowPlainLetters').checked = config.allowPlainLetters !== false;
        document.getElementById('allowExclamation').checked = config.allowExclamation !== false;
        document.getElementById('allowSlash').checked = config.allowSlash || false;
        document.getElementById('allowFullText').checked = config.allowFullText !== false;
        document.getElementById('jokerCommandPrefix').value = config.jokerCommandPrefix || '!joker';
        document.getElementById('jokerSuperfanOnly').checked = config.jokerSuperfanOnly !== false;
        document.getElementById('answerPermissionLevel').value = config.answerPermissionLevel || 'all';
        document.getElementById('useGCCE').checked = config.useGCCE || false;
        
        // Load AI settings from state
        loadAISettings();
    }

    async function loadAISettings() {
        try {
            const response = await fetch('/api/quiz-show/ai-config');
            const data = await response.json();
            
            if (data.success && data.config) {
                const apiKeyField = document.getElementById('openaiApiKeySettings');
                const modelField = document.getElementById('openaiModelSettings');
                const packageSizeField = document.getElementById('defaultPackageSizeSettings');
                
                if (apiKeyField && data.config.hasKey) {
                    apiKeyField.placeholder = '••••••••••••';
                }
                if (modelField && data.config.model) {
                    modelField.value = data.config.model;
                }
                if (packageSizeField && data.config.defaultPackageSize) {
                    packageSizeField.value = data.config.defaultPackageSize;
                }
            }
        } catch (error) {
            console.error('Error loading AI settings:', error);
        }
    }

    function updateQuestionsList() {
        const questions = currentState.questions;
        const container = document.getElementById('questionsList');
        const countDisplay = document.getElementById('questionCount');

        countDisplay.textContent = `${questions.length} Fragen`;

        if (questions.length === 0) {
            container.innerHTML = '<p class="no-data">Keine Fragen vorhanden</p>';
            return;
        }

        const difficultyStars = (difficulty) => '⭐'.repeat(difficulty || 2);

        container.innerHTML = questions.map((q, index) => `
            <div class="question-item" data-id="${q.id}">
                <div class="question-number">#${index + 1}</div>
                <div class="question-content">
                    <div class="question-text">${escapeHtml(q.question)}</div>
                    <div class="question-meta" style="font-size: 0.9em; color: #888; margin: 5px 0;">
                        <span>📁 ${escapeHtml(q.category || 'Allgemein')}</span>
                        <span style="margin-left: 15px;">${difficultyStars(q.difficulty)}</span>
                    </div>
                    <div class="question-answers">
                        ${q.answers.map((ans, idx) => `
                            <span class="answer-badge ${idx === q.correct ? 'correct' : ''}">
                                ${String.fromCharCode(65 + idx)}: ${escapeHtml(ans)}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <div class="question-actions">
                    <button class="btn-icon btn-edit-question" data-question-id="${q.id}" title="Bearbeiten">✏️</button>
                    <button class="btn-icon btn-delete-question" data-question-id="${q.id}" title="Löschen">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    function updateLeaderboardTable() {
        const leaderboard = currentState.leaderboard;
        const tbody = document.getElementById('leaderboardBody');

        if (leaderboard.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="no-data">Keine Einträge</td></tr>';
            return;
        }

        tbody.innerHTML = leaderboard.map((entry, index) => `
            <tr>
                <td class="rank">
                    ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                </td>
                <td>${escapeHtml(entry.username)}</td>
                <td class="points">${entry.points}</td>
            </tr>
        `).join('');
    }

    function updateStatistics() {
        const stats = currentState.stats;

        document.getElementById('totalRounds').textContent = stats.totalRounds || 0;
        document.getElementById('totalCorrect').textContent = stats.totalCorrectAnswers || 0;

        const successRate = stats.totalAnswers > 0
            ? Math.round((stats.totalCorrectAnswers / stats.totalAnswers) * 100)
            : 0;
        document.getElementById('successRate').textContent = successRate + '%';
    }

    function displayCurrentQuestion(question) {
        const display = document.getElementById('currentQuestionDisplay');
        const optionsContainer = document.getElementById('answerOptions');

        display.innerHTML = `<p class="question-text">${escapeHtml(question.question)}</p>`;

        optionsContainer.innerHTML = question.answers.map((ans, idx) => `
            <div class="answer-option" data-index="${idx}">
                <span class="answer-letter">${String.fromCharCode(65 + idx)}</span>
                <span class="answer-text">${escapeHtml(ans)}</span>
            </div>
        `).join('');

        optionsContainer.classList.remove('hidden');
    }

    function hideQuestion() {
        const display = document.getElementById('currentQuestionDisplay');
        const optionsContainer = document.getElementById('answerOptions');

        display.innerHTML = '<p class="no-question">Keine Frage aktiv</p>';
        optionsContainer.classList.add('hidden');
    }

    function showTimer(seconds, total) {
        const timerDisplay = document.getElementById('timerDisplay');
        const timeRemaining = document.getElementById('timeRemaining');
        const timerBar = document.getElementById('timerBar');

        timerDisplay.classList.remove('hidden');
        timeRemaining.textContent = seconds;

        const percentage = (seconds / total) * 100;
        timerBar.style.width = percentage + '%';

        // Color coding
        if (percentage > 50) {
            timerBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        } else if (percentage > 20) {
            timerBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        } else {
            timerBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        }
    }

    function updateTimer(seconds, total) {
        const timeRemaining = document.getElementById('timeRemaining');
        const timerBar = document.getElementById('timerBar');

        timeRemaining.textContent = seconds;

        const percentage = (seconds / total) * 100;
        timerBar.style.width = percentage + '%';

        // Color coding
        if (percentage > 50) {
            timerBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        } else if (percentage > 20) {
            timerBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        } else {
            timerBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        }
    }

    function hideTimer() {
        document.getElementById('timerDisplay').classList.add('hidden');
    }

    function updateAnswerCount(count) {
        document.getElementById('answerCount').textContent = count;
    }

    function highlightCorrectAnswer(index) {
        const options = document.querySelectorAll('.answer-option');
        if (options[index]) {
            options[index].classList.add('correct');
        }
    }

    function hideAnswers(indices) {
        const options = document.querySelectorAll('.answer-option');
        indices.forEach(idx => {
            if (options[idx]) {
                options[idx].classList.add('hidden-answer');
            }
        });
    }

    function markWrongAnswer(index) {
        const options = document.querySelectorAll('.answer-option');
        if (options[index]) {
            options[index].classList.add('wrong-hint');
        }
    }

    function addJokerEvent(joker) {
        const container = document.getElementById('jokerEvents');

        // Remove "no events" message if present
        const noEvents = container.querySelector('.no-events');
        if (noEvents) {
            noEvents.remove();
        }

        const jokerNames = {
            '50': '50:50 Joker',
            'info': 'Info Joker',
            'time': 'Zeit Joker'
        };

        const jokerIcons = {
            '50': '✂️',
            'info': '💡',
            'time': '⏰'
        };

        const event = document.createElement('div');
        event.className = 'joker-event';
        event.innerHTML = `
            <span class="joker-icon">${jokerIcons[joker.type]}</span>
            <span class="joker-info">
                <strong>${jokerNames[joker.type]}</strong> von ${escapeHtml(joker.username)}
            </span>
        `;

        container.insertBefore(event, container.firstChild);

        // Keep only last 5 events
        while (container.children.length > 5) {
            container.removeChild(container.lastChild);
        }
    }

    function showMessage(text, type = 'info', elementId = null) {
        if (elementId) {
            const element = document.getElementById(elementId);
            element.textContent = text;
            element.className = `message message-${type}`;
            element.classList.remove('hidden');

            setTimeout(() => {
                element.classList.add('hidden');
            }, 3000);
        } else {
            // Create floating notification
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.textContent = text;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.classList.add('show');
            }, 10);

            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // HUD OVERLAY CONFIGURATION
    // ============================================

    let hudConfig = {};

    async function loadHUDConfig() {
        try {
            const response = await fetch('/api/quiz-show/hud-config');
            const data = await response.json();

            if (data.success && data.config) {
                hudConfig = data.config;
                applyHUDConfigToForm();
            }
        } catch (error) {
            console.error('Error loading HUD config:', error);
        }
    }

    function applyHUDConfigToForm() {
        // Theme & Style
        document.getElementById('hudTheme').value = hudConfig.theme || 'dark';
        document.getElementById('answersLayout').value = hudConfig.answersLayout || 'grid';
        document.getElementById('animationSpeed').value = hudConfig.animationSpeed || 1;
        document.getElementById('animationSpeedValue').textContent = (hudConfig.animationSpeed || 1).toFixed(1);
        document.getElementById('glowIntensity').value = hudConfig.glowIntensity || 1;
        document.getElementById('glowIntensityValue').textContent = (hudConfig.glowIntensity || 1).toFixed(1);

        // Animations
        document.getElementById('questionAnimation').value = hudConfig.questionAnimation || 'slide-in-bottom';
        document.getElementById('correctAnimation').value = hudConfig.correctAnimation || 'glow-pulse';
        document.getElementById('wrongAnimation').value = hudConfig.wrongAnimation || 'shake';

        // Timer
        document.getElementById('timerVariant').value = hudConfig.timerVariant || 'circular';

        // Colors
        if (hudConfig.colors) {
            document.getElementById('colorPrimary').value = hudConfig.colors.primary || '#3b82f6';
            document.getElementById('colorSecondary').value = hudConfig.colors.secondary || '#8b5cf6';
            document.getElementById('colorSuccess').value = hudConfig.colors.success || '#10b981';
            document.getElementById('colorWarning').value = hudConfig.colors.warning || '#f59e0b';
            document.getElementById('colorDanger').value = hudConfig.colors.danger || '#ef4444';
        }

        // Fonts
        if (hudConfig.fonts) {
            document.getElementById('fontFamily').value = hudConfig.fonts.family || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            document.getElementById('fontSizeQuestion').value = hudConfig.fonts.sizeQuestion || '2.2rem';
            document.getElementById('fontSizeAnswer').value = hudConfig.fonts.sizeAnswer || '1.1rem';
        }

        // Custom CSS
        document.getElementById('customCSS').value = hudConfig.customCSS || '';

        // Update preview scale based on HUD config
        const resolution = `${hudConfig.streamWidth || 1920}x${hudConfig.streamHeight || 1080}`;
        updatePreviewScale(resolution);
    }

    function getHUDConfigFromForm() {
        // Use the stored HUD config dimensions or defaults
        const streamWidth = hudConfig.streamWidth || 1920;
        const streamHeight = hudConfig.streamHeight || 1080;

        return {
            theme: document.getElementById('hudTheme').value,
            questionAnimation: document.getElementById('questionAnimation').value,
            correctAnimation: document.getElementById('correctAnimation').value,
            wrongAnimation: document.getElementById('wrongAnimation').value,
            timerVariant: document.getElementById('timerVariant').value,
            answersLayout: document.getElementById('answersLayout').value,
            animationSpeed: parseFloat(document.getElementById('animationSpeed').value),
            glowIntensity: parseFloat(document.getElementById('glowIntensity').value),
            customCSS: document.getElementById('customCSS').value,
            streamWidth: streamWidth,
            streamHeight: streamHeight,
            positions: hudConfig.positions || {},
            colors: {
                primary: document.getElementById('colorPrimary').value,
                secondary: document.getElementById('colorSecondary').value,
                success: document.getElementById('colorSuccess').value,
                warning: document.getElementById('colorWarning').value,
                danger: document.getElementById('colorDanger').value
            },
            fonts: {
                family: document.getElementById('fontFamily').value,
                sizeQuestion: document.getElementById('fontSizeQuestion').value,
                sizeAnswer: document.getElementById('fontSizeAnswer').value
            }
        };
    }

    async function saveHUDConfig() {
        try {
            const config = getHUDConfigFromForm();

            const response = await fetch('/api/quiz-show/hud-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const data = await response.json();

            if (data.success) {
                hudConfig = data.config;
                showMessage('HUD-Konfiguration erfolgreich gespeichert!', 'success', 'hudSaveMessage');
                refreshPreview();
            } else {
                showMessage('Fehler beim Speichern: ' + data.error, 'error', 'hudSaveMessage');
            }
        } catch (error) {
            showMessage('Netzwerkfehler: ' + error.message, 'error', 'hudSaveMessage');
        }
    }

    async function resetHUDConfig() {
        if (!confirm('Möchten Sie die HUD-Konfiguration wirklich auf Standard zurücksetzen? Alle Positionen und Einstellungen gehen verloren.')) {
            return;
        }

        try {
            const response = await fetch('/api/quiz-show/hud-config/reset', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                hudConfig = data.config;
                applyHUDConfigToForm();
                showMessage('HUD-Konfiguration auf Standard zurückgesetzt!', 'success', 'hudSaveMessage');
                refreshPreview();
            } else {
                showMessage('Fehler beim Zurücksetzen: ' + data.error, 'error', 'hudSaveMessage');
            }
        } catch (error) {
            showMessage('Netzwerkfehler: ' + error.message, 'error', 'hudSaveMessage');
        }
    }

    function refreshPreview() {
        const iframe = document.getElementById('overlayPreview');
        iframe.src = iframe.src;
    }

    function updatePreviewScale(resolution) {
        const [width, height] = resolution.split('x').map(Number);
        const wrapper = document.getElementById('previewWrapper');
        const iframe = document.getElementById('overlayPreview');

        // Calculate scale to fit preview
        const wrapperWidth = wrapper.clientWidth;
        const wrapperHeight = 500;
        const scale = Math.min(wrapperWidth / width, wrapperHeight / height);

        iframe.style.width = width + 'px';
        iframe.style.height = height + 'px';
        iframe.style.transform = `scale(${scale})`;

        wrapper.style.height = (height * scale) + 'px';
    }

    function openOverlay() {
        window.open('/quiz-show/overlay', 'QuizShowOverlay', 'width=1920,height=1080');
    }

    // HUD Tab Event Listeners
    if (document.getElementById('saveHUDConfigBtn')) {
        document.getElementById('saveHUDConfigBtn').addEventListener('click', saveHUDConfig);
    }
    if (document.getElementById('resetHUDConfigBtn')) {
        document.getElementById('resetHUDConfigBtn').addEventListener('click', resetHUDConfig);
    }
    if (document.getElementById('openOverlayBtn')) {
        document.getElementById('openOverlayBtn').addEventListener('click', openOverlay);
    }
    if (document.getElementById('openLeaderboardOverlayBtn')) {
        document.getElementById('openLeaderboardOverlayBtn').addEventListener('click', openLeaderboardOverlay);
    }
    if (document.getElementById('refreshPreviewBtn')) {
        document.getElementById('refreshPreviewBtn').addEventListener('click', refreshPreview);
    }

    // Range sliders
    if (document.getElementById('animationSpeed')) {
        document.getElementById('animationSpeed').addEventListener('input', (e) => {
            const valueElement = document.getElementById('animationSpeedValue');
            if (valueElement) {
                valueElement.textContent = parseFloat(e.target.value).toFixed(1);
            }
        });
    }

    if (document.getElementById('glowIntensity')) {
        document.getElementById('glowIntensity').addEventListener('input', (e) => {
            const valueElement = document.getElementById('glowIntensityValue');
            if (valueElement) {
                valueElement.textContent = parseFloat(e.target.value).toFixed(1);
            }
        });
    }

    // Load HUD config and layouts when overlay-config tab is opened
    const overlayConfigTab = document.querySelector('[data-tab="overlay-config"]');
    if (overlayConfigTab) {
        overlayConfigTab.addEventListener('click', () => {
            setTimeout(() => {
                loadHUDConfig();
                loadLayouts();
                // Initialize draggable elements
                requestAnimationFrame(() => {
                    requestAnimationFrame(initializeGridEditor);
                });
            }, 100);
        });
    }

    function openLeaderboardOverlay() {
        window.open('/quiz-show/leaderboard-overlay', '_blank', 'width=600,height=800');
    }

    // ============================================
    // CATEGORIES AND SEASONS
    // ============================================
    
    async function loadCategories() {
        try {
            const response = await fetch('/api/quiz-show/categories');
            const data = await response.json();
            
            if (data.success) {
                const categoryList = document.getElementById('categoryList');
                const categoryFilterOptions = document.getElementById('categoryFilterOptions');
                
                // Update datalist for question editor
                if (categoryList) {
                    categoryList.innerHTML = data.categories.map(cat => 
                        `<option value="${escapeHtml(cat)}"></option>`
                    ).join('');
                }
                
                // Update category filter dropdown with checkboxes
                if (categoryFilterOptions) {
                    categoryFilterOptions.innerHTML = data.categories.map((cat, index) => {
                        const checkboxId = `category-checkbox-${index}`;
                        return `<label for="${checkboxId}">
                            <input type="checkbox" id="${checkboxId}" class="category-filter-checkbox" value="${escapeHtml(cat)}">
                            ${escapeHtml(cat)}
                        </label>`;
                    }).join('');
                    
                    // Restore selected categories from config
                    updateCategoryFilterUI();
                    
                    // Add event listeners to checkboxes
                    const checkboxes = categoryFilterOptions.querySelectorAll('.category-filter-checkbox');
                    checkboxes.forEach(checkbox => {
                        checkbox.addEventListener('change', onCategoryCheckboxChange);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }
    
    // Helper function to get selected categories
    function getSelectedCategories() {
        const allCheckbox = document.getElementById('categoryFilterAll');
        if (allCheckbox && allCheckbox.checked) {
            return ['Alle'];
        }
        
        const checkboxes = document.querySelectorAll('.category-filter-checkbox:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);
        return selected.length > 0 ? selected : ['Alle'];
    }
    
    // Helper function to set selected categories
    function setSelectedCategories(categories) {
        const allCheckbox = document.getElementById('categoryFilterAll');
        const categoryCheckboxes = document.querySelectorAll('.category-filter-checkbox');
        
        // Convert string to array for backwards compatibility
        if (typeof categories === 'string') {
            categories = categories === 'Alle' ? ['Alle'] : [categories];
        }
        
        if (!categories || categories.length === 0 || categories.includes('Alle')) {
            // Select "All"
            if (allCheckbox) allCheckbox.checked = true;
            categoryCheckboxes.forEach(cb => cb.checked = false);
        } else {
            // Deselect "All" and select specific categories
            if (allCheckbox) allCheckbox.checked = false;
            categoryCheckboxes.forEach(cb => {
                cb.checked = categories.includes(cb.value);
            });
        }
        
        updateCategoryFilterLabel();
    }
    
    // Update the label to show selected categories
    function updateCategoryFilterLabel() {
        const label = document.getElementById('categoryFilterLabel');
        if (!label) return;
        
        const selected = getSelectedCategories();
        
        if (selected.includes('Alle') || selected.length === 0) {
            label.textContent = 'Alle Kategorien';
        } else if (selected.length === 1) {
            label.textContent = selected[0];
        } else {
            label.textContent = `${selected.length} Kategorien`;
        }
    }
    
    // Update UI based on current config
    function updateCategoryFilterUI() {
        const config = currentState.config;
        let categories = config.categoryFilter || ['Alle'];
        
        // Handle backwards compatibility: convert string to array
        if (typeof categories === 'string') {
            categories = categories === 'Alle' ? ['Alle'] : [categories];
        }
        
        setSelectedCategories(categories);
    }
    
    // Handler for category checkbox changes
    function onCategoryCheckboxChange(e) {
        const allCheckbox = document.getElementById('categoryFilterAll');
        const categoryCheckboxes = document.querySelectorAll('.category-filter-checkbox');
        
        if (e.target === allCheckbox) {
            // If "All" is checked, uncheck all categories
            if (allCheckbox.checked) {
                categoryCheckboxes.forEach(cb => cb.checked = false);
            }
        } else {
            // If any category is checked, uncheck "All"
            if (e.target.checked && allCheckbox) {
                allCheckbox.checked = false;
            }
            
            // If no categories are checked, check "All"
            const anyChecked = Array.from(categoryCheckboxes).some(cb => cb.checked);
            if (!anyChecked && allCheckbox) {
                allCheckbox.checked = true;
            }
        }
        
        updateCategoryFilterLabel();
    }
    
    // Initialize category filter dropdown (add at document ready)
    function initializeCategoryFilterDropdown() {
        const button = document.getElementById('categoryFilterButton');
        const dropdown = document.getElementById('categoryFilterDropdown');
        const allCheckbox = document.getElementById('categoryFilterAll');
        
        if (!button || !dropdown) return;
        
        // Toggle dropdown on button click
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!button.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        // Prevent dropdown from closing when clicking inside
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // "All" checkbox handler
        if (allCheckbox) {
            allCheckbox.addEventListener('change', onCategoryCheckboxChange);
        }

    }

    function handleDashboardHotkeys(event) {
        if (event.repeat) return;

        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
            return;
        }

        if (event.shiftKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            toggleAutoModeHotkey();
        }
    }

    async function toggleAutoModeHotkey() {
        const checkbox = document.getElementById('autoMode');
        if (!checkbox) return;

        const newValue = !checkbox.checked;
        await updateAutoModeSetting(newValue);

        const message = newValue ? 'Auto Modus per Hotkey aktiviert' : 'Auto Modus per Hotkey deaktiviert';
        showMessage(message, 'info');
    }
    
    async function loadSeasons() {
        try {
            const response = await fetch('/api/quiz-show/seasons');
            const data = await response.json();
            
            if (data.success) {
                const seasonSelect = document.getElementById('seasonSelect');
                const currentSeason = seasonSelect.value;
                
                seasonSelect.innerHTML = '<option value="active">Aktuelle Saison</option>' +
                    data.seasons.filter(s => !s.is_active).map(season =>
                        `<option value="${season.id}">${escapeHtml(season.season_name)} (${new Date(season.start_date).toLocaleDateString()})</option>`
                    ).join('');
                    
                if (currentSeason !== 'active') {
                    seasonSelect.value = currentSeason;
                }
            }
        } catch (error) {
            console.error('Error loading seasons:', error);
        }
    }
    
    async function loadTTSVoices() {
        try {
            // Load available TTS voices from the TTS plugin
            const response = await fetch('/api/tts/voices?engine=all');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.voices) {
                const ttsVoiceSelect = document.getElementById('ttsVoice');
                if (!ttsVoiceSelect) return;
                
                // Store current value
                const currentValue = ttsVoiceSelect.value;
                
                // Build options array
                let options = '<option value="default">Standard (System)</option>';
                
                // Add OpenAI voices if available (GPT-4o Mini TTS recommended)
                if (data.voices.openai) {
                    const voices = Object.entries(data.voices.openai)
                        .map(([key, voice]) => {
                            const label = `OpenAI: ${voice.name || key}`;
                            // Mark GPT-4o Mini TTS voices as recommended
                            const recommended = key.includes('gpt-4o-mini-tts') ? ' (Empfohlen)' : '';
                            return `<option value="openai:${key}">${label}${recommended}</option>`;
                        })
                        .join('');
                    if (voices) {
                        options += '<optgroup label="OpenAI TTS (Premium)">' + voices + '</optgroup>';
                    }
                }
                
                // Add TikTok voices (free, German available)
                if (data.voices.tiktok) {
                    const germanVoices = Object.entries(data.voices.tiktok)
                        .filter(([key, voice]) => voice.language && voice.language.toLowerCase().includes('de'))
                        .map(([key, voice]) => `<option value="tiktok:${key}">TikTok: ${voice.name || key}</option>`)
                        .join('');
                    if (germanVoices) {
                        options += '<optgroup label="TikTok (Kostenlos)">' + germanVoices + '</optgroup>';
                    }
                }
                
                // Add Google voices if available
                if (data.voices.google) {
                    const germanVoices = Object.entries(data.voices.google)
                        .filter(([key, voice]) => key.startsWith('de-DE'))
                        .map(([key, voice]) => `<option value="google:${key}">Google: ${voice.name || key}</option>`)
                        .join('');
                    if (germanVoices) {
                        options += '<optgroup label="Google Cloud TTS">' + germanVoices + '</optgroup>';
                    }
                }
                
                // Add Speechify voices if available
                if (data.voices.speechify) {
                    const germanVoices = Object.entries(data.voices.speechify)
                        .filter(([key, voice]) => voice.language && voice.language.toLowerCase().includes('de'))
                        .map(([key, voice]) => `<option value="speechify:${key}">Speechify: ${voice.name || key}</option>`)
                        .join('');
                    if (germanVoices) {
                        options += '<optgroup label="Speechify">' + germanVoices + '</optgroup>';
                    }
                }
                
                // Add ElevenLabs voices if available
                if (data.voices.elevenlabs) {
                    const voices = Object.entries(data.voices.elevenlabs)
                        .map(([key, voice]) => `<option value="elevenlabs:${key}">ElevenLabs: ${voice.name || key}</option>`)
                        .join('');
                    if (voices) {
                        options += '<optgroup label="ElevenLabs">' + voices + '</optgroup>';
                    }
                }
                
                ttsVoiceSelect.innerHTML = options;
                
                // Restore previous value if it still exists
                if (currentValue && Array.from(ttsVoiceSelect.options).some(opt => opt.value === currentValue)) {
                    ttsVoiceSelect.value = currentValue;
                }
            }
        } catch (error) {
            console.error('Error loading TTS voices:', error);
            // Keep default hardcoded options if loading fails
        }
    }
    
    async function createNewSeason() {
        const seasonName = prompt('Name der neuen Saison:', `Saison ${new Date().getFullYear()}`);
        if (!seasonName) return;
        
        if (!confirm(`Neue Saison "${seasonName}" erstellen? Die aktuelle Saison wird archiviert.`)) {
            return;
        }
        
        try {
            const response = await fetch('/api/quiz-show/seasons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seasonName })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showMessage(`Neue Saison "${seasonName}" erstellt`, 'success');
                loadSeasons();
                loadInitialState(); // Reload leaderboard
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error creating season:', error);
            showMessage('Fehler beim Erstellen der Saison', 'error');
        }
    }
    
    async function loadSeasonLeaderboard(seasonId) {
        if (seasonId === 'active') {
            await loadInitialState();
            return;
        }
        
        try {
            const response = await fetch(`/api/quiz-show/seasons/${seasonId}/leaderboard`);
            const data = await response.json();
            
            if (data.success) {
                currentState.leaderboard = data.leaderboard;
                updateLeaderboardTable();
            }
        } catch (error) {
            console.error('Error loading season leaderboard:', error);
            showMessage('Fehler beim Laden des Leaderboards', 'error');
        }
    }

    // ============================================
    // AI PACKAGES FUNCTIONS
    // ============================================
    
    async function loadOpenAIConfig() {
        // Note: OpenAI configuration is now managed in the main settings panel
        try {
            const response = await fetch('/api/quiz-show/openai/config');
            const data = await response.json();

            if (data.success && data.config) {
                const config = data.config;
                
                // Still show status for reference, but config is in main settings
                const warning = document.getElementById('generateWarning');
                if (warning) {
                    if (config.hasApiKey) {
                        warning.style.display = 'none';
                    } else {
                        warning.style.display = 'block';
                    }
                }
            }
        } catch (error) {
            console.error('Error loading OpenAI config:', error);
        }
    }

    async function saveOpenAIConfig() {
        // Deprecated - OpenAI config is now in main settings
        alert('OpenAI-Konfiguration wird jetzt im Haupteinstellungspanel verwaltet. Bitte speichern Sie Ihren API-Schlüssel dort.');
    }

    async function testOpenAIKey() {
        // Deprecated - OpenAI config is now in main settings
        alert('OpenAI-Konfiguration wird jetzt im Haupteinstellungspanel verwaltet. Bitte speichern Sie Ihren API-Schlüssel dort.');
    }

    async function testOpenAIKeyFromSettings() {
        // Deprecated - OpenAI config is now in main settings  
        alert('OpenAI-Konfiguration wird jetzt im Haupteinstellungspanel verwaltet. Bitte speichern Sie Ihren API-Schlüssel dort.');
    }

    async function generateQuestionPackage() {
        const category = document.getElementById('packageCategory').value.trim();
        const packageSize = parseInt(document.getElementById('packageSize').value);
        const packageName = document.getElementById('packageName').value.trim();

        if (!category) {
            showMessage('Bitte geben Sie eine Kategorie ein', 'error', 'generateMessage');
            return;
        }

        try {
            // Show progress
            const progressContainer = document.getElementById('generationProgress');
            const progressBar = document.getElementById('generationProgressBar');
            const progressText = document.getElementById('generationProgressText');
            
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '10%';
            progressText.textContent = 'Generiere Fragen mit OpenAI...';

            const btn = document.getElementById('generatePackageBtn');
            const originalText = btn.textContent;
            btn.textContent = '🤖 Generiere...';
            btn.disabled = true;

            const response = await fetch('/api/quiz-show/packages/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category,
                    packageSize,
                    packageName: packageName || undefined
                })
            });

            progressBar.style.width = '50%';
            progressText.textContent = 'Verarbeite Antworten...';

            const data = await response.json();

            progressBar.style.width = '100%';
            progressText.textContent = 'Fertig!';

            btn.textContent = originalText;
            btn.disabled = false;

            if (data.success) {
                showMessage(`✓ Paket "${data.package.name}" mit ${data.package.question_count} Fragen erfolgreich generiert!`, 'success', 'generateMessage');
                
                // Clear form
                document.getElementById('packageCategory').value = '';
                document.getElementById('packageName').value = '';

                // Reload packages
                await loadPackages();

                // Hide progress after delay
                setTimeout(() => {
                    progressContainer.classList.add('hidden');
                }, 2000);
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'generateMessage');
                progressContainer.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error generating package:', error);
            showMessage('Fehler: ' + error.message, 'error', 'generateMessage');
            document.getElementById('generationProgress').classList.add('hidden');
            document.getElementById('generatePackageBtn').disabled = false;
        }
    }

    async function loadPackages() {
        try {
            const response = await fetch('/api/quiz-show/packages');
            const data = await response.json();

            if (data.success) {
                updatePackagesList(data.packages);
            }
        } catch (error) {
            console.error('Error loading packages:', error);
        }
    }

    function updatePackagesList(packages) {
        const container = document.getElementById('packagesList');
        const countDisplay = document.getElementById('packageCount');

        countDisplay.textContent = `${packages.length} Pakete`;

        if (packages.length === 0) {
            container.innerHTML = '<p class="no-data">Keine Pakete vorhanden. Generieren Sie Ihr erstes Paket oben!</p>';
            return;
        }

        container.innerHTML = packages.map(pkg => `
            <div class="package-item ${pkg.is_selected ? 'selected' : ''}" data-id="${pkg.id}">
                <input 
                    type="checkbox" 
                    class="package-checkbox package-toggle-checkbox" 
                    ${pkg.is_selected ? 'checked' : ''}
                    data-package-id="${pkg.id}"
                >
                <div class="package-info">
                    <div class="package-header">
                        <span class="package-name">${escapeHtml(pkg.name)}</span>
                        <span class="package-badge">${escapeHtml(pkg.category)}</span>
                    </div>
                    <div class="package-meta">
                        <div class="package-meta-item">
                            <span>📝 ${pkg.question_count} Fragen</span>
                        </div>
                        <div class="package-meta-item">
                            <span>📅 ${new Date(pkg.created_at).toLocaleDateString('de-DE')}</span>
                        </div>
                    </div>
                </div>
                <div class="package-actions">
                    <button class="btn-view btn-view-package" data-package-id="${pkg.id}" title="Fragen anzeigen">
                        👁️ Anzeigen
                    </button>
                    <button class="btn-delete btn-delete-package" data-package-id="${pkg.id}" title="Paket löschen">
                        🗑️ Löschen
                    </button>
                </div>
            </div>
        `).join('');
    }

    async function togglePackage(packageId) {
        try {
            const response = await fetch(`/api/quiz-show/packages/${packageId}/toggle`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                // Reload packages to update UI
                await loadPackages();
            }
        } catch (error) {
            console.error('Error toggling package:', error);
        }
    }

    async function deletePackage(packageId) {
        if (!confirm('Dieses Paket und alle seine Fragen wirklich löschen?')) {
            return;
        }

        try {
            const response = await fetch(`/api/quiz-show/packages/${packageId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Paket erfolgreich gelöscht', 'success');
                await loadPackages();
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting package:', error);
            showMessage('Fehler beim Löschen', 'error');
        }
    }

    async function viewPackageQuestions(packageId) {
        try {
            const response = await fetch(`/api/quiz-show/packages/${packageId}/questions`);
            const data = await response.json();

            if (data.success) {
                // Switch to questions tab and show these questions
                const questionsTab = document.querySelector('[data-tab="questions"]');
                if (questionsTab) {
                    questionsTab.click();
                }
                
                // Update questions list to show only these questions
                currentState.questions = data.questions;
                updateQuestionsList();
                
                // Show message indicating filtered view
                const packageInfo = currentState.packages?.find(p => p.id === packageId);
                const packageName = packageInfo?.name || 'Paket';
                showMessage(`Anzeige von ${data.questions.length} Fragen aus "${packageName}"`, 'success');
                
                // Scroll to questions list
                const questionsList = document.getElementById('questionsList');
                if (questionsList) {
                    questionsList.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                showMessage('Fehler beim Laden der Fragen: ' + (data.error || 'Unbekannter Fehler'), 'error');
            }
        } catch (error) {
            console.error('Error viewing package questions:', error);
            showMessage('Fehler beim Laden der Fragen', 'error');
        }
    }

    // ============================================
    // LAYOUT EDITOR
    // ============================================

    let layouts = [];
    let currentLayout = null;
    let activeLayoutId = null; // Track active layout
    let isDragging = false;
    let draggedElement = null;

    // Load layouts on page load
    async function loadLayouts() {
        try {
            const response = await fetch('/api/quiz-show/layouts');
            const data = await response.json();
            
            if (data.success) {
                layouts = data.layouts;
            }
            
            // Load active layout info
            const activeResponse = await fetch('/api/quiz-show/layouts/active');
            const activeData = await activeResponse.json();
            if (activeData.success && activeData.customLayoutEnabled && activeData.layout) {
                activeLayoutId = activeData.layout.id;
            } else {
                activeLayoutId = null;
            }
            
            renderLayoutsList();
        } catch (error) {
            console.error('Error loading layouts:', error);
        }
    }

    function renderLayoutsList() {
        const container = document.getElementById('layoutsList');
        if (!container) return;

        if (layouts.length === 0) {
            container.innerHTML = '<p class="no-data">Keine Layouts vorhanden</p>';
            return;
        }

        container.innerHTML = layouts.map(layout => {
            const isActive = activeLayoutId === layout.id;
            const activeBadge = isActive ? '<span class="badge badge-success">Aktiv</span>' : '';
            const defaultBadge = layout.is_default ? '<span class="badge">Standard</span>' : '';
            
            return `
            <div class="layout-item ${isActive ? 'active' : ''}" data-id="${layout.id}">
                <div class="layout-info">
                    <div class="layout-name">${escapeHtml(layout.name)}${activeBadge}</div>
                    <div class="layout-meta">
                        ${layout.resolution_width}x${layout.resolution_height} | 
                        ${layout.orientation === 'horizontal' ? '🖼️ Landscape' : '📱 Portrait'}
                        ${defaultBadge}
                    </div>
                </div>
                <div class="layout-actions">
                    ${isActive 
                        ? `<button class="btn-icon btn-deactivate-layout" title="Deaktivieren">⏸️</button>`
                        : `<button class="btn-icon btn-activate-layout" data-layout-id="${layout.id}" title="Aktivieren">▶️</button>`
                    }
                    <button class="btn-icon btn-edit-layout" data-layout-id="${layout.id}" title="Bearbeiten">✏️</button>
                    <button class="btn-icon btn-delete-layout" data-layout-id="${layout.id}" title="Löschen">🗑️</button>
                </div>
            </div>
        `;
        }).join('');
    }

    function createNewLayout() {
        currentLayout = null;
        document.getElementById('layoutName').value = '';
        document.getElementById('layoutWidth').value = 1920;
        document.getElementById('layoutHeight').value = 1080;
        document.getElementById('layoutOrientation').value = 'horizontal';
        document.getElementById('layoutIsDefault').checked = false;
        
        // Show layout editor section
        const editorSection = document.getElementById('layoutEditorSection');
        if (editorSection) {
            editorSection.style.display = 'block';
        }
        
        // Reset preview
        resetLayoutPreview();
        
        // Scroll to editor
        if (editorSection) {
            editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        showMessage('Neues Layout erstellen', 'info', 'layoutSaveMessage');
    }

    async function editLayout(layoutId) {
        try {
            const response = await fetch(`/api/quiz-show/layouts/${layoutId}`);
            const data = await response.json();
            
            if (data.success && data.layout) {
                currentLayout = data.layout;
                
                document.getElementById('layoutName').value = data.layout.name;
                document.getElementById('layoutWidth').value = data.layout.resolution_width;
                document.getElementById('layoutHeight').value = data.layout.resolution_height;
                document.getElementById('layoutOrientation').value = data.layout.orientation;
                document.getElementById('layoutIsDefault').checked = data.layout.is_default;
                
                // Show layout editor section
                const editorSection = document.getElementById('layoutEditorSection');
                if (editorSection) {
                    editorSection.style.display = 'block';
                }
                
                // Load layout config
                if (data.layout.layout_config) {
                    const config = JSON.parse(data.layout.layout_config);
                    applyLayoutConfig(config);
                }
                
                // Scroll to editor
                if (editorSection) {
                    editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                showMessage('Layout wird bearbeitet', 'info', 'layoutSaveMessage');
            }
        } catch (error) {
            console.error('Error loading layout:', error);
            showMessage('Fehler beim Laden des Layouts', 'error', 'layoutSaveMessage');
        }
    }

    async function saveLayout() {
        const name = document.getElementById('layoutName').value.trim();
        const width = parseInt(document.getElementById('layoutWidth').value, 10);
        const height = parseInt(document.getElementById('layoutHeight').value, 10);
        const orientation = document.getElementById('layoutOrientation').value;
        const isDefault = document.getElementById('layoutIsDefault').checked;
        
        if (!name) {
            showMessage('Bitte geben Sie einen Namen ein', 'error', 'layoutSaveMessage');
            return;
        }
        
        // Collect element positions
        const layoutConfig = collectLayoutConfig();
        
        const payload = {
            name,
            resolutionWidth: width,
            resolutionHeight: height,
            orientation,
            isDefault,
            layoutConfig: JSON.stringify(layoutConfig)
        };
        
        try {
            const url = currentLayout 
                ? `/api/quiz-show/layouts/${currentLayout.id}` 
                : '/api/quiz-show/layouts';
            const method = currentLayout ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (data.success) {
                showMessage('Layout gespeichert', 'success', 'layoutSaveMessage');
                await loadLayouts();
                currentLayout = null;
                
                // Hide layout editor section after save
                const editorSection = document.getElementById('layoutEditorSection');
                if (editorSection) {
                    editorSection.style.display = 'none';
                }
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'layoutSaveMessage');
            }
        } catch (error) {
            console.error('Error saving layout:', error);
            showMessage('Fehler beim Speichern', 'error', 'layoutSaveMessage');
        }
    }

    async function deleteLayout(layoutId) {
        if (!confirm('Layout wirklich löschen?')) return;
        
        try {
            const response = await fetch(`/api/quiz-show/layouts/${layoutId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                showMessage('Layout gelöscht', 'success', 'layoutSaveMessage');
                await loadLayouts();
                if (currentLayout && currentLayout.id === layoutId) {
                    currentLayout = null;
                    
                    // Hide layout editor section after delete
                    const editorSection = document.getElementById('layoutEditorSection');
                    if (editorSection) {
                        editorSection.style.display = 'none';
                    }
                }
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'layoutSaveMessage');
            }
        } catch (error) {
            console.error('Error deleting layout:', error);
            showMessage('Fehler beim Löschen', 'error', 'layoutSaveMessage');
        }
    }

    async function activateLayout(layoutId) {
        try {
            const response = await fetch(`/api/quiz-show/layouts/${layoutId}/activate`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                showMessage('Layout aktiviert - Overlay wurde aktualisiert', 'success', 'layoutSaveMessage');
                activeLayoutId = layoutId;
                renderLayoutsList();
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'layoutSaveMessage');
            }
        } catch (error) {
            console.error('Error activating layout:', error);
            showMessage('Fehler beim Aktivieren', 'error', 'layoutSaveMessage');
        }
    }

    async function deactivateLayout() {
        try {
            const response = await fetch('/api/quiz-show/layouts/deactivate', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                showMessage('Layout deaktiviert - Overlay verwendet Standard-Positionen', 'success', 'layoutSaveMessage');
                activeLayoutId = null;
                renderLayoutsList();
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'layoutSaveMessage');
            }
        } catch (error) {
            console.error('Error deactivating layout:', error);
            showMessage('Fehler beim Deaktivieren', 'error', 'layoutSaveMessage');
        }
    }

    function collectLayoutConfig() {
        const config = {};
        
        // Collect grid-based configuration from table
        const rows = document.querySelectorAll('.element-config-table tbody tr');
        
        rows.forEach(row => {
            const elementType = row.dataset.element;
            const column = row.querySelector('.grid-column').value;
            const rowNum = parseInt(row.querySelector('.grid-row').value, 10);
            const size = row.querySelector('.grid-size').value;
            const visible = row.querySelector('.grid-visible').checked;
            
            config[elementType] = {
                gridColumn: column,
                gridRow: rowNum,
                size: size,
                visible: visible
            };
        });
        
        return config;
    }

    function applyLayoutConfig(config) {
        if (!config) return;
        
        // Handle both old pixel format and new grid format
        const elements = config.elements || config;
        
        Object.entries(elements).forEach(([elementType, props]) => {
            const row = document.querySelector(`.element-config-table tbody tr[data-element="${elementType}"]`);
            if (!row) return;
            
            // If it's the new grid format
            if (props.gridColumn !== undefined) {
                row.querySelector('.grid-column').value = props.gridColumn || 'C';
                row.querySelector('.grid-row').value = props.gridRow || 1;
                row.querySelector('.grid-size').value = props.size || 'medium';
                row.querySelector('.grid-visible').checked = props.visible !== false;
            } else {
                // Old pixel-based format - convert to grid (approximate)
                // This is for backwards compatibility
                const width = props.width || 800;
                
                // Convert X position to column, clamped to A-T (0-19 indices)
                const columnIndex = props.x ? Math.min(19, Math.floor(props.x / 100)) : 2; // Default C
                const column = String.fromCharCode(65 + columnIndex);
                
                // Convert Y position to row, clamped to 1-20
                const rowNum = props.y ? Math.min(20, Math.max(1, Math.floor(props.y / 50))) : 1;
                
                // Determine size based on width
                let size = 'medium';
                if (width < 500) size = 'small';
                else if (width > 1400) size = 'xlarge';
                else if (width > 1000) size = 'large';
                
                row.querySelector('.grid-column').value = column;
                row.querySelector('.grid-row').value = rowNum;
                row.querySelector('.grid-size').value = size;
                row.querySelector('.grid-visible').checked = props.visible !== false;
            }
        });
        
        // Update visual preview
        updateGridPreview();
    }

    function resetLayoutPreview() {
        const defaultConfig = {
            question: { gridColumn: 'C', gridRow: 2, size: 'medium', visible: true },
            answers: { gridColumn: 'C', gridRow: 5, size: 'medium', visible: true },
            timer: { gridColumn: 'O', gridRow: 2, size: 'small', visible: true },
            leaderboard: { gridColumn: 'O', gridRow: 6, size: 'medium', visible: true },
            jokerInfo: { gridColumn: 'C', gridRow: 13, size: 'small', visible: true }
        };
        
        applyLayoutConfig(defaultConfig);
    }

    function cancelLayoutEdit() {
        currentLayout = null;
        
        // Hide layout editor section
        const editorSection = document.getElementById('layoutEditorSection');
        if (editorSection) {
            editorSection.style.display = 'none';
        }
        
        // Clear form
        document.getElementById('layoutName').value = '';
        document.getElementById('layoutWidth').value = 1920;
        document.getElementById('layoutHeight').value = 1080;
        document.getElementById('layoutOrientation').value = 'horizontal';
        document.getElementById('layoutIsDefault').checked = false;
        
        showMessage('', '', 'layoutSaveMessage'); // Clear message
    }

    // Initialize layout editor event listeners
    if (document.getElementById('createNewLayoutBtn')) {
        document.getElementById('createNewLayoutBtn').addEventListener('click', createNewLayout);
    }
    if (document.getElementById('saveLayoutBtn')) {
        document.getElementById('saveLayoutBtn').addEventListener('click', saveLayout);
    }
    if (document.getElementById('deleteLayoutBtn')) {
        document.getElementById('deleteLayoutBtn').addEventListener('click', () => {
            if (currentLayout) {
                deleteLayout(currentLayout.id);
            }
        });
    }
    if (document.getElementById('cancelLayoutBtn')) {
        document.getElementById('cancelLayoutBtn').addEventListener('click', cancelLayoutEdit);
    }

    // Initialize grid-based layout editor
    function initializeGridEditor() {
        // Create grid overlay
        createGridOverlay();
        
        // Add event listeners to grid inputs for live preview
        const gridInputs = document.querySelectorAll('.grid-column, .grid-row, .grid-size, .grid-visible');
        gridInputs.forEach(input => {
            input.addEventListener('change', updateGridPreview);
        });
        
        // Add event listeners for layout resolution and orientation changes
        const layoutWidth = document.getElementById('layoutWidth');
        const layoutHeight = document.getElementById('layoutHeight');
        const layoutOrientation = document.getElementById('layoutOrientation');
        
        if (layoutWidth) {
            layoutWidth.addEventListener('input', updateGridPreviewWithResolution);
        }
        if (layoutHeight) {
            layoutHeight.addEventListener('input', updateGridPreviewWithResolution);
        }
        if (layoutOrientation) {
            layoutOrientation.addEventListener('change', updateGridPreviewWithResolution);
        }
        
        // Initialize drag and drop functionality
        initializeDragAndDrop();
        
        // Initialize visual preview
        updateGridPreview();
    }
    
    function createGridOverlay() {
        const gridOverlay = document.querySelector('.grid-overlay');
        if (!gridOverlay) return;
        
        gridOverlay.innerHTML = '';
        
        // Create 20 columns (A-T)
        for (let i = 0; i < 20; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line-vertical';
            line.style.left = (i * 5) + '%';
            gridOverlay.appendChild(line);
            
            if (i < 20) {
                const label = document.createElement('div');
                label.className = 'grid-label';
                label.textContent = String.fromCharCode(65 + i); // A, B, C, ...
                label.style.left = (i * 5 + 1) + '%';
                label.style.top = '5px';
                gridOverlay.appendChild(label);
            }
        }
        
        // Create 20 rows
        for (let i = 0; i < 20; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line-horizontal';
            line.style.top = (i * 5) + '%';
            gridOverlay.appendChild(line);
            
            if (i < 20) {
                const label = document.createElement('div');
                label.className = 'grid-label';
                label.textContent = (i + 1).toString();
                label.style.left = '5px';
                label.style.top = (i * 5 + 1) + '%';
                gridOverlay.appendChild(label);
            }
        }
    }
    
    // Helper function to update preview when resolution/orientation changes
    function updateGridPreviewWithResolution() {
        // Update the preview container aspect ratio based on orientation
        const gridPreview = document.getElementById('gridVisualPreview');
        if (!gridPreview) return;
        
        const layoutWidth = parseInt(document.getElementById('layoutWidth')?.value, 10) || 1920;
        const layoutHeight = parseInt(document.getElementById('layoutHeight')?.value, 10) || 1080;
        const orientation = document.getElementById('layoutOrientation')?.value || 'horizontal';
        
        // Calculate aspect ratio with validation to prevent division by zero
        const aspectRatio = layoutHeight > 0 ? layoutWidth / layoutHeight : 16/9;
        
        // Update container to maintain aspect ratio
        if (orientation === 'vertical') {
            // Portrait mode - adjust width based on height
            gridPreview.style.width = (500 / aspectRatio) + 'px';
            gridPreview.style.height = '500px';
        } else {
            // Landscape mode - use full width
            gridPreview.style.width = '100%';
            gridPreview.style.height = '';
            // Use requestAnimationFrame to ensure the width change has been applied
            requestAnimationFrame(() => {
                const actualWidth = gridPreview.getBoundingClientRect().width;
                if (actualWidth > 0) {
                    gridPreview.style.height = (actualWidth / aspectRatio) + 'px';
                }
            });
        }
        
        // Update the grid preview with new dimensions
        updateGridPreview();
    }
    
    function updateGridPreview() {
        const gridElements = document.getElementById('gridElements');
        if (!gridElements) return;
        
        gridElements.innerHTML = '';
        
        // Size definitions (width x height in pixels for standard 1920x1080)
        const sizeDefinitions = {
            question: {
                small: { width: 400, height: 100 },
                medium: { width: 800, height: 150 },
                large: { width: 1200, height: 200 },
                xlarge: { width: 1600, height: 250 }
            },
            answers: {
                small: { width: 400, height: 300 },
                medium: { width: 800, height: 400 },
                large: { width: 1200, height: 500 },
                xlarge: { width: 1600, height: 600 }
            },
            timer: {
                small: { width: 150, height: 150 },
                medium: { width: 200, height: 200 },
                large: { width: 250, height: 250 },
                xlarge: { width: 300, height: 300 }
            },
            leaderboard: {
                small: { width: 250, height: 300 },
                medium: { width: 300, height: 400 },
                large: { width: 350, height: 500 },
                xlarge: { width: 400, height: 600 }
            },
            jokerInfo: {
                small: { width: 300, height: 80 },
                medium: { width: 400, height: 100 },
                large: { width: 500, height: 120 },
                xlarge: { width: 600, height: 150 }
            }
        };
        
        const elementLabels = {
            question: '❓ Frage',
            answers: '🅰️ Antworten',
            timer: '⏱️ Timer',
            leaderboard: '🏆 Leaderboard',
            jokerInfo: '🎯 Joker Info'
        };
        
        // Get layout resolution from inputs (fallback to 1920x1080)
        const layoutWidth = parseInt(document.getElementById('layoutWidth')?.value, 10) || 1920;
        const layoutHeight = parseInt(document.getElementById('layoutHeight')?.value, 10) || 1080;
        
        // Read grid settings from table (use specific ID to avoid conflicts)
        const layoutEditorTable = document.getElementById('layoutEditorSection');
        if (!layoutEditorTable) return;
        
        const rows = layoutEditorTable.querySelectorAll('.element-config-table tbody tr');
        rows.forEach(row => {
            const elementType = row.dataset.element;
            const columnInput = row.querySelector('.grid-column');
            const rowInput = row.querySelector('.grid-row');
            const sizeInput = row.querySelector('.grid-size');
            const visibleInput = row.querySelector('.grid-visible');
            
            if (!columnInput || !rowInput || !sizeInput || !visibleInput) return;
            
            const column = columnInput.value || 'C';
            const rowNum = parseInt(rowInput.value, 10) || 1;
            const size = sizeInput.value || 'medium';
            const visible = visibleInput.checked;
            
            if (!visible) return; // Skip invisible elements
            
            // Calculate position based on grid, with validation
            const columnChar = column.toUpperCase();
            const columnIndex = Math.max(0, Math.min(19, columnChar.charCodeAt(0) - 65));
            const validatedRow = Math.max(1, Math.min(20, rowNum));
            
            const x = (columnIndex * 5); // 5% per column
            const y = ((validatedRow - 1) * 5); // 5% per row
            
            // Get size dimensions
            const dimensions = sizeDefinitions[elementType]?.[size] || { width: 300, height: 100 };
            
            // Calculate percentage sizes based on actual layout resolution
            const widthPercent = (dimensions.width / layoutWidth) * 100;
            const heightPercent = (dimensions.height / layoutHeight) * 100;
            
            // Create element
            const element = document.createElement('div');
            element.className = 'grid-element';
            element.dataset.element = elementType;
            element.textContent = elementLabels[elementType] || elementType;
            element.style.left = x + '%';
            element.style.top = y + '%';
            element.style.width = widthPercent + '%';
            element.style.height = heightPercent + '%';
            
            // Make element draggable
            element.draggable = true;
            element.addEventListener('dragstart', handleDragStart);
            element.addEventListener('dragend', handleDragEnd);
            
            gridElements.appendChild(element);
        });
    }
    
    // Drag and Drop handlers for grid elements
    function handleDragStart(e) {
        draggedElement = e.target;
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
    }
    
    function handleDragEnd(e) {
        e.target.style.opacity = '1';
        draggedElement = null;
    }
    
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }
    
    function handleDrop(e) {
        e.stopPropagation();
        e.preventDefault();
        
        if (!draggedElement) return false;
        
        // Get the drop position relative to the preview container
        const previewContainer = document.getElementById('gridVisualPreview');
        if (!previewContainer) return false;
        
        const rect = previewContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Calculate grid position (each cell is 5%)
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;
        
        // Convert to grid coordinates
        const columnIndex = Math.max(0, Math.min(19, Math.floor(xPercent / 5)));
        const rowIndex = Math.max(0, Math.min(19, Math.floor(yPercent / 5)));
        
        const column = String.fromCharCode(65 + columnIndex); // A, B, C, ...
        const row = rowIndex + 1; // 1-20
        
        // Update the form inputs for the dragged element
        const elementType = draggedElement.dataset.element;
        const layoutEditorTable = document.getElementById('layoutEditorSection');
        if (layoutEditorTable) {
            const targetRow = layoutEditorTable.querySelector(`tr[data-element="${elementType}"]`);
            if (targetRow) {
                const columnInput = targetRow.querySelector('.grid-column');
                const rowInput = targetRow.querySelector('.grid-row');
                
                if (columnInput && rowInput) {
                    columnInput.value = column;
                    rowInput.value = row;
                    
                    // Update the preview
                    updateGridPreview();
                }
            }
        }
        
        return false;
    }
    
    // Initialize drag and drop on preview container
    function initializeDragAndDrop() {
        const gridPreview = document.getElementById('gridVisualPreview');
        if (gridPreview) {
            gridPreview.addEventListener('dragover', handleDragOver);
            gridPreview.addEventListener('drop', handleDrop);
        }
    }

    // ============================================
    // END LAYOUT EDITOR
    // ============================================

    // ============================================
    // GIFT-JOKER MANAGEMENT
    // ============================================

    let giftJokers = [];
    let editingGiftJokerId = null;
    let giftCatalog = [];

    async function loadGiftCatalog() {
        try {
            const response = await fetch('/api/quiz-show/gift-catalog');
            const data = await response.json();
            
            if (data.success) {
                giftCatalog = data.gifts;
                populateGiftSelector();
                populateQuizStartGiftSelector();
            }
        } catch (error) {
            console.error('Error loading gift catalog:', error);
        }
    }

    function populateGiftSelector() {
        const selector = document.getElementById('giftSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">-- Geschenk wählen --</option>' +
            giftCatalog.map(gift => {
                const giftId = parseInt(gift.id, 10);
                const diamondCount = parseInt(gift.diamond_count, 10) || 0;
                const giftName = escapeHtml(gift.name);
                return `
                    <option value="${giftId}" data-name="${giftName}">
                        ${giftName} (ID: ${giftId}, 💎 ${diamondCount})
                    </option>
                `;
            }).join('');

        // Remove any existing event listeners to prevent duplicates
        const newSelector = selector.cloneNode(true);
        selector.parentNode.replaceChild(newSelector, selector);
        
        // Add event listener to the new element
        newSelector.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption.value) {
                document.getElementById('giftJokerId').value = selectedOption.value;
                document.getElementById('giftJokerName').value = selectedOption.dataset.name;
            }
        });
    }

    function populateQuizStartGiftSelector() {
        const selector = document.getElementById('quizStartGiftSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">-- Geschenk wählen --</option>' +
            giftCatalog.map(gift => {
                const giftId = parseInt(gift.id, 10);
                const diamondCount = parseInt(gift.diamond_count, 10) || 0;
                const giftName = escapeHtml(gift.name);
                return `
                    <option value="${giftId}" data-name="${giftName}">
                        ${giftName} (ID: ${giftId}, 💎 ${diamondCount})
                    </option>
                `;
            }).join('');

        // Remove any existing event listeners to prevent duplicates
        const newSelector = selector.cloneNode(true);
        selector.parentNode.replaceChild(newSelector, selector);
        
        // Add event listener to the new element
        newSelector.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption.value) {
                document.getElementById('quizStartGiftId').value = selectedOption.value;
                document.getElementById('quizStartGiftName').value = selectedOption.dataset.name;
            }
        });
    }

    async function loadGiftJokers() {
        try {
            const response = await fetch('/api/quiz-show/gift-jokers');
            const data = await response.json();
            
            if (data.success) {
                giftJokers = data.mappings;
                renderGiftJokersTable();
            }
        } catch (error) {
            console.error('Error loading gift-jokers:', error);
        }
    }

    function renderGiftJokersTable() {
        const tbody = document.getElementById('giftJokerTableBody');
        if (!tbody) return;

        if (giftJokers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Keine Zuordnungen vorhanden</td></tr>';
            return;
        }

        const jokerNames = {
            '25': '25% Joker',
            '50': '50:50 Joker',
            'info': 'Info Joker',
            'time': 'Zeit Joker'
        };

        tbody.innerHTML = giftJokers.map(mapping => `
            <tr>
                <td>${mapping.gift_id}</td>
                <td>${escapeHtml(mapping.gift_name)}</td>
                <td>${jokerNames[mapping.joker_type] || mapping.joker_type}</td>
                <td><span class="status-badge ${mapping.enabled ? 'status-connected' : 'status-error'}">${mapping.enabled ? 'Aktiv' : 'Inaktiv'}</span></td>
                <td>
                    <button class="btn-icon btn-edit-gift-joker" data-gift-id="${mapping.gift_id}" title="Bearbeiten">✏️</button>
                    <button class="btn-icon btn-delete-gift-joker" data-gift-id="${mapping.gift_id}" title="Löschen">🗑️</button>
                </td>
            </tr>
        `).join('');
    }

    function showGiftJokerForm() {
        const panel = document.getElementById('giftJokerFormPanel');
        if (panel) {
            panel.style.display = 'block';
            document.getElementById('giftSelector').value = '';
            document.getElementById('giftJokerId').value = '';
            document.getElementById('giftJokerName').value = '';
            document.getElementById('giftJokerType').value = '50';
            document.getElementById('giftJokerEnabled').checked = true;
            editingGiftJokerId = null;
        }
    }

    function hideGiftJokerForm() {
        const panel = document.getElementById('giftJokerFormPanel');
        if (panel) {
            panel.style.display = 'none';
        }
        editingGiftJokerId = null;
    }

    async function editGiftJoker(giftId) {
        const mapping = giftJokers.find(m => m.gift_id === giftId);
        if (!mapping) return;

        editingGiftJokerId = giftId;
        
        document.getElementById('giftJokerId').value = mapping.gift_id;
        document.getElementById('giftJokerName').value = mapping.gift_name;
        document.getElementById('giftJokerType').value = mapping.joker_type;
        document.getElementById('giftJokerEnabled').checked = mapping.enabled;
        
        const panel = document.getElementById('giftJokerFormPanel');
        if (panel) {
            panel.style.display = 'block';
        }
    }

    async function saveGiftJoker() {
        const giftId = parseInt(document.getElementById('giftJokerId').value, 10);
        const giftName = document.getElementById('giftJokerName').value.trim();
        const jokerType = document.getElementById('giftJokerType').value;
        const enabled = document.getElementById('giftJokerEnabled').checked;

        if (!giftId || !giftName || isNaN(giftId)) {
            showMessage('Bitte alle Felder korrekt ausfüllen', 'error', 'giftJokerSaveMessage');
            return;
        }

        try {
            const response = await fetch('/api/quiz-show/gift-jokers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ giftId, giftName, jokerType, enabled })
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Zuordnung gespeichert', 'success', 'giftJokerSaveMessage');
                giftJokers = data.mappings;
                renderGiftJokersTable();
                hideGiftJokerForm();
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'giftJokerSaveMessage');
            }
        } catch (error) {
            console.error('Error saving gift-joker:', error);
            showMessage('Fehler beim Speichern', 'error', 'giftJokerSaveMessage');
        }
    }

    async function deleteGiftJoker(giftId) {
        if (!confirm('Zuordnung wirklich löschen?')) return;

        try {
            const response = await fetch(`/api/quiz-show/gift-jokers/${giftId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Zuordnung gelöscht', 'success');
                await loadGiftJokers();
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting gift-joker:', error);
            showMessage('Fehler beim Löschen', 'error');
        }
    }

    // Initialize gift-joker event listeners
    if (document.getElementById('addGiftJokerBtn')) {
        document.getElementById('addGiftJokerBtn').addEventListener('click', showGiftJokerForm);
    }
    if (document.getElementById('saveGiftJokerBtn')) {
        document.getElementById('saveGiftJokerBtn').addEventListener('click', saveGiftJoker);
    }
    if (document.getElementById('cancelGiftJokerBtn')) {
        document.getElementById('cancelGiftJokerBtn').addEventListener('click', hideGiftJokerForm);
    }

    // Load gift-jokers when tab is opened
    const giftJokersTab = document.querySelector('[data-tab="gift-jokers"]');
    if (giftJokersTab) {
        giftJokersTab.addEventListener('click', () => {
            loadGiftCatalog();
            loadGiftJokers();
            loadQuizStartGiftConfig();
        });
    }

    // ============================================
    // QUIZ-START GIFT CONFIGURATION
    // ============================================

    async function loadQuizStartGiftConfig() {
        try {
            const response = await fetch('/api/quiz-show/quiz-start-gift');
            const data = await response.json();
            
            if (data.success && data.config) {
                const config = data.config;
                
                const enabledCheckbox = document.getElementById('quizStartGiftEnabled');
                const configDiv = document.getElementById('quizStartGiftConfig');
                const giftIdInput = document.getElementById('quizStartGiftId');
                const giftNameInput = document.getElementById('quizStartGiftName');
                const giftSelector = document.getElementById('quizStartGiftSelector');
                
                if (enabledCheckbox) {
                    enabledCheckbox.checked = config.enabled;
                }
                
                if (configDiv) {
                    configDiv.style.display = config.enabled ? 'block' : 'none';
                }
                
                if (giftIdInput && config.gift_id) {
                    giftIdInput.value = config.gift_id;
                }
                
                if (giftNameInput && config.gift_name) {
                    giftNameInput.value = config.gift_name;
                }
                
                if (giftSelector && config.gift_id) {
                    giftSelector.value = config.gift_id;
                }
            }
        } catch (error) {
            console.error('Error loading quiz-start gift config:', error);
        }
    }

    async function saveQuizStartGiftConfig() {
        const enabled = document.getElementById('quizStartGiftEnabled').checked;
        const giftId = parseInt(document.getElementById('quizStartGiftId').value, 10);
        const giftName = document.getElementById('quizStartGiftName').value.trim();

        if (enabled && (!giftId || !giftName || isNaN(giftId))) {
            showMessage('Bitte wählen Sie ein Geschenk aus oder geben Sie ID und Name ein', 'error', 'quizStartGiftSaveMessage');
            return;
        }

        try {
            const response = await fetch('/api/quiz-show/quiz-start-gift', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    enabled, 
                    giftId: enabled ? giftId : null, 
                    giftName: enabled ? giftName : null 
                })
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Quiz-Start Geschenk gespeichert', 'success', 'quizStartGiftSaveMessage');
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'quizStartGiftSaveMessage');
            }
        } catch (error) {
            console.error('Error saving quiz-start gift config:', error);
            showMessage('Fehler beim Speichern', 'error', 'quizStartGiftSaveMessage');
        }
    }

    // Toggle quiz-start gift config visibility (only add listener once at initialization)
    const quizStartGiftEnabledCheckbox = document.getElementById('quizStartGiftEnabled');
    if (quizStartGiftEnabledCheckbox && !quizStartGiftEnabledCheckbox.dataset.listenerAdded) {
        quizStartGiftEnabledCheckbox.addEventListener('change', (e) => {
            const configDiv = document.getElementById('quizStartGiftConfig');
            if (configDiv) {
                configDiv.style.display = e.target.checked ? 'block' : 'none';
            }
        });
        quizStartGiftEnabledCheckbox.dataset.listenerAdded = 'true';
    }

    // Save quiz-start gift config button (only add listener once at initialization)
    const saveQuizStartGiftBtn = document.getElementById('saveQuizStartGiftBtn');
    if (saveQuizStartGiftBtn && !saveQuizStartGiftBtn.dataset.listenerAdded) {
        saveQuizStartGiftBtn.addEventListener('click', saveQuizStartGiftConfig);
        saveQuizStartGiftBtn.dataset.listenerAdded = 'true';
    }

    // ============================================
    // END QUIZ-START GIFT CONFIGURATION
    // ============================================

    // ============================================
    // END GIFT-JOKER MANAGEMENT
    // ============================================

    // ============================================
    // ACCORDION FUNCTIONALITY FOR OVERLAY CONFIG
    // ============================================

    function initializeAccordion() {
        const accordionHeaders = document.querySelectorAll('.accordion-header');
        
        accordionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const section = header.dataset.section;
                const content = document.querySelector(`[data-content="${section}"]`);
                const isActive = header.classList.contains('active');
                
                // Toggle active state
                if (isActive) {
                    header.classList.remove('active');
                    content.classList.remove('active');
                } else {
                    header.classList.add('active');
                    content.classList.add('active');
                }
            });
        });

        // Open first section by default
        if (accordionHeaders.length > 0) {
            accordionHeaders[0].classList.add('active');
            const firstSection = accordionHeaders[0].dataset.section;
            const firstContent = document.querySelector(`[data-content="${firstSection}"]`);
            if (firstContent) {
                firstContent.classList.add('active');
            }
        }
    }

    // Initialize accordion when overlay-config tab is opened
    const overlayConfigTabButton = document.querySelector('[data-tab="overlay-config"]');
    if (overlayConfigTabButton) {
        overlayConfigTabButton.addEventListener('click', () => {
            setTimeout(() => {
                initializeAccordion();
            }, 100);
        });
    }

    // ============================================
    // INDIVIDUAL SAVE BUTTON HANDLERS
    // ============================================

    // Show/hide layout editor section
    if (document.getElementById('createNewLayoutBtn')) {
        document.getElementById('createNewLayoutBtn').addEventListener('click', () => {
            const editorSection = document.getElementById('layoutEditorSection');
            if (editorSection) {
                editorSection.style.display = 'block';
                // Scroll to editor
                editorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    if (document.getElementById('cancelLayoutBtn')) {
        document.getElementById('cancelLayoutBtn').addEventListener('click', () => {
            const editorSection = document.getElementById('layoutEditorSection');
            if (editorSection) {
                editorSection.style.display = 'none';
            }
        });
    }

    // Visual Settings Save Button
    if (document.getElementById('saveVisualSettingsBtn')) {
        document.getElementById('saveVisualSettingsBtn').addEventListener('click', async () => {
            try {
                const config = getHUDConfigFromForm();
                const response = await fetch('/api/quiz-show/hud-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const data = await response.json();
                
                if (data.success) {
                    hudConfig = data.config;
                    showMessage('Visuelle Einstellungen gespeichert!', 'success', 'visualSaveMessage');
                    refreshPreview();
                } else {
                    showMessage('Fehler: ' + data.error, 'error', 'visualSaveMessage');
                }
            } catch (error) {
                showMessage('Netzwerkfehler: ' + error.message, 'error', 'visualSaveMessage');
            }
        });
    }

    // Animation Settings Save Button
    if (document.getElementById('saveAnimationSettingsBtn')) {
        document.getElementById('saveAnimationSettingsBtn').addEventListener('click', async () => {
            try {
                const config = getHUDConfigFromForm();
                const response = await fetch('/api/quiz-show/hud-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const data = await response.json();
                
                if (data.success) {
                    hudConfig = data.config;
                    showMessage('Animations-Einstellungen gespeichert!', 'success', 'animationSaveMessage');
                    refreshPreview();
                } else {
                    showMessage('Fehler: ' + data.error, 'error', 'animationSaveMessage');
                }
            } catch (error) {
                showMessage('Netzwerkfehler: ' + error.message, 'error', 'animationSaveMessage');
            }
        });
    }

    // Color & Font Settings Save Button
    if (document.getElementById('saveColorFontSettingsBtn')) {
        document.getElementById('saveColorFontSettingsBtn').addEventListener('click', async () => {
            try {
                const config = getHUDConfigFromForm();
                const response = await fetch('/api/quiz-show/hud-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const data = await response.json();
                
                if (data.success) {
                    hudConfig = data.config;
                    showMessage('Farben & Schriften gespeichert!', 'success', 'colorFontSaveMessage');
                    refreshPreview();
                } else {
                    showMessage('Fehler: ' + data.error, 'error', 'colorFontSaveMessage');
                }
            } catch (error) {
                showMessage('Netzwerkfehler: ' + error.message, 'error', 'colorFontSaveMessage');
            }
        });
    }

    // Custom CSS Save Button
    if (document.getElementById('saveCustomCSSBtn')) {
        document.getElementById('saveCustomCSSBtn').addEventListener('click', async () => {
            try {
                const config = getHUDConfigFromForm();
                const response = await fetch('/api/quiz-show/hud-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const data = await response.json();
                
                if (data.success) {
                    hudConfig = data.config;
                    showMessage('Custom CSS gespeichert!', 'success', 'customCSSSaveMessage');
                    refreshPreview();
                } else {
                    showMessage('Fehler: ' + data.error, 'error', 'customCSSSaveMessage');
                }
            } catch (error) {
                showMessage('Netzwerkfehler: ' + error.message, 'error', 'customCSSSaveMessage');
            }
        });
    }

    // ===== Leaderboard Display Configuration =====
    
    // Load leaderboard configuration
    async function loadLeaderboardConfig() {
        try {
            const response = await fetch('/api/quiz-show/leaderboard-config');
            const data = await response.json();
            
            if (data.success && data.config) {
                const config = data.config;
                
                // Set checkbox values
                const showAfterQuestion = document.getElementById('leaderboardShowAfterQuestion');
                const showAfterRound = document.getElementById('leaderboardShowAfterRound');
                
                if (showAfterQuestion) showAfterQuestion.checked = config.show_after_question;
                if (showAfterRound) showAfterRound.checked = config.show_after_round;
                
                // Set select values
                const questionDisplayType = document.getElementById('leaderboardQuestionDisplayType');
                const roundDisplayType = document.getElementById('leaderboardRoundDisplayType');
                const endGameDisplayType = document.getElementById('leaderboardEndGameDisplayType');
                const animationStyle = document.getElementById('leaderboardAnimationStyle');
                const autoHideDelay = document.getElementById('leaderboardAutoHideDelay');
                
                if (questionDisplayType) questionDisplayType.value = config.question_display_type || 'season';
                if (roundDisplayType) roundDisplayType.value = config.round_display_type || 'both';
                if (endGameDisplayType) endGameDisplayType.value = config.end_game_display_type || 'season';
                if (animationStyle) animationStyle.value = config.animation_style || 'fade';
                if (autoHideDelay) autoHideDelay.value = config.auto_hide_delay || 10;
                
                // Toggle visibility of question display type based on checkbox
                toggleQuestionDisplayType();
                toggleRoundDisplayType();
            }
        } catch (error) {
            console.error('Error loading leaderboard config:', error);
        }
    }
    
    // Toggle visibility of question display type options
    function toggleQuestionDisplayType() {
        const showAfterQuestion = document.getElementById('leaderboardShowAfterQuestion');
        const questionDisplayTypeGroup = document.getElementById('questionDisplayTypeGroup');
        
        if (showAfterQuestion && questionDisplayTypeGroup) {
            questionDisplayTypeGroup.style.display = showAfterQuestion.checked ? 'block' : 'none';
        }
    }
    
    // Toggle visibility of round display type options
    function toggleRoundDisplayType() {
        const showAfterRound = document.getElementById('leaderboardShowAfterRound');
        const roundDisplayTypeGroup = document.getElementById('roundDisplayTypeGroup');
        
        if (showAfterRound && roundDisplayTypeGroup) {
            roundDisplayTypeGroup.style.display = showAfterRound.checked ? 'block' : 'none';
        }
    }
    
    // Save leaderboard configuration
    if (document.getElementById('saveLeaderboardConfigBtn')) {
        document.getElementById('saveLeaderboardConfigBtn').addEventListener('click', async () => {
            try {
                const showAfterQuestion = document.getElementById('leaderboardShowAfterQuestion');
                const showAfterRound = document.getElementById('leaderboardShowAfterRound');
                const questionDisplayType = document.getElementById('leaderboardQuestionDisplayType');
                const roundDisplayType = document.getElementById('leaderboardRoundDisplayType');
                const endGameDisplayType = document.getElementById('leaderboardEndGameDisplayType');
                const autoHideDelay = document.getElementById('leaderboardAutoHideDelay');
                const animationStyle = document.getElementById('leaderboardAnimationStyle');
                
                const config = {
                    showAfterQuestion: showAfterQuestion ? showAfterQuestion.checked : false,
                    showAfterRound: showAfterRound ? showAfterRound.checked : true,
                    questionDisplayType: questionDisplayType ? questionDisplayType.value : 'season',
                    roundDisplayType: roundDisplayType ? roundDisplayType.value : 'both',
                    endGameDisplayType: endGameDisplayType ? endGameDisplayType.value : 'season',
                    autoHideDelay: autoHideDelay ? parseInt(autoHideDelay.value) : 10,
                    animationStyle: animationStyle ? animationStyle.value : 'fade'
                };
                
                const response = await fetch('/api/quiz-show/leaderboard-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage('Leaderboard-Einstellungen gespeichert!', 'success', 'leaderboardConfigSaveMessage');
                } else {
                    showMessage('Fehler: ' + data.error, 'error', 'leaderboardConfigSaveMessage');
                }
            } catch (error) {
                showMessage('Netzwerkfehler: ' + error.message, 'error', 'leaderboardConfigSaveMessage');
            }
        });
    }
    
    // Add change listeners for checkboxes to toggle visibility
    if (document.getElementById('leaderboardShowAfterQuestion')) {
        document.getElementById('leaderboardShowAfterQuestion').addEventListener('change', toggleQuestionDisplayType);
    }
    if (document.getElementById('leaderboardShowAfterRound')) {
        document.getElementById('leaderboardShowAfterRound').addEventListener('change', toggleRoundDisplayType);
    }
    
    // Load leaderboard config on page load
    loadLeaderboardConfig();

    // ===== Batch AI Question Generation =====
    
    let batchGenerationActive = false;
    
    // Batch generate button
    if (document.getElementById('batchGenerateBtn')) {
        document.getElementById('batchGenerateBtn').addEventListener('click', async () => {
            try {
                const categoriesTextarea = document.getElementById('batchCategories');
                const batchPackageSize = document.getElementById('batchPackageSize');
                const batchGenerateBtn = document.getElementById('batchGenerateBtn');
                const batchGenerationProgress = document.getElementById('batchGenerationProgress');
                const batchProgressLog = document.getElementById('batchProgressLog');
                
                if (!categoriesTextarea) return;
                
                const categoriesText = categoriesTextarea.value.trim();
                if (!categoriesText) {
                    showMessage('Bitte geben Sie mindestens eine Kategorie ein', 'error', 'batchGenerateMessage');
                    return;
                }
                
                // Parse categories (one per line)
                const categories = categoriesText
                    .split('\n')
                    .map(c => c.trim())
                    .filter(c => c.length > 0);
                
                if (categories.length === 0) {
                    showMessage('Bitte geben Sie mindestens eine Kategorie ein', 'error', 'batchGenerateMessage');
                    return;
                }
                
                const packageSize = batchPackageSize ? parseInt(batchPackageSize.value) : 10;
                
                // Disable button
                if (batchGenerateBtn) {
                    batchGenerateBtn.disabled = true;
                    batchGenerateBtn.textContent = '⏳ Generierung läuft...';
                }
                
                // Show progress
                if (batchGenerationProgress) {
                    batchGenerationProgress.classList.remove('hidden');
                }
                if (batchProgressLog) {
                    batchProgressLog.innerHTML = '';
                    batchProgressLog.innerHTML += `<div style="color: #10b981;">[${new Date().toLocaleTimeString()}] Batch-Generierung gestartet für ${categories.length} Kategorien...</div>`;
                }
                
                batchGenerationActive = true;
                
                const response = await fetch('/api/quiz-show/packages/batch-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categories, packageSize })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage(`Batch-Generierung gestartet für ${data.totalCategories} Kategorien`, 'success', 'batchGenerateMessage');
                } else {
                    showMessage('Fehler: ' + data.error, 'error', 'batchGenerateMessage');
                    if (batchGenerateBtn) {
                        batchGenerateBtn.disabled = false;
                        batchGenerateBtn.textContent = '🤖 Batch Generierung Starten';
                    }
                    batchGenerationActive = false;
                }
            } catch (error) {
                showMessage('Netzwerkfehler: ' + error.message, 'error', 'batchGenerateMessage');
                const batchGenerateBtn = document.getElementById('batchGenerateBtn');
                if (batchGenerateBtn) {
                    batchGenerateBtn.disabled = false;
                    batchGenerateBtn.textContent = '🤖 Batch Generierung Starten';
                }
                batchGenerationActive = false;
            }
        });
    }
    
    // Listen for batch generation progress events
    socket.on('quiz-show:batch-generation-progress', (data) => {
        const batchProgressText = document.getElementById('batchProgressText');
        const batchProgressBar = document.getElementById('batchProgressBar');
        const batchProgressLog = document.getElementById('batchProgressLog');
        
        if (batchProgressText) {
            batchProgressText.textContent = `${data.current} / ${data.total}`;
        }
        
        if (batchProgressBar) {
            const percentage = (data.current / data.total) * 100;
            batchProgressBar.style.width = percentage + '%';
        }
        
        if (batchProgressLog) {
            const timestamp = new Date().toLocaleTimeString();
            let logLine = '';
            
            if (data.status === 'processing') {
                logLine = `<div style="color: #3b82f6;">[${timestamp}] Verarbeite ${data.current}/${data.total}: ${data.category}...</div>`;
            } else if (data.status === 'success') {
                logLine = `<div style="color: #10b981;">[${timestamp}] ✓ ${data.category} - ${data.questionCount} Fragen generiert</div>`;
            } else if (data.status === 'failed') {
                logLine = `<div style="color: #ef4444;">[${timestamp}] ✗ ${data.category} - Fehler: ${data.error}</div>`;
            }
            
            batchProgressLog.innerHTML += logLine;
            batchProgressLog.scrollTop = batchProgressLog.scrollHeight;
        }
    });
    
    // Listen for batch generation complete event
    socket.on('quiz-show:batch-generation-complete', (data) => {
        const batchGenerateBtn = document.getElementById('batchGenerateBtn');
        const batchProgressLog = document.getElementById('batchProgressLog');
        
        if (batchGenerateBtn) {
            batchGenerateBtn.disabled = false;
            batchGenerateBtn.textContent = '🤖 Batch Generierung Starten';
        }
        
        if (batchProgressLog) {
            const timestamp = new Date().toLocaleTimeString();
            batchProgressLog.innerHTML += `<div style="color: #10b981; font-weight: bold; margin-top: 10px;">[${timestamp}] Batch-Generierung abgeschlossen!</div>`;
            batchProgressLog.innerHTML += `<div style="color: #a0a0a0;">Erfolgreich: ${data.successCount} | Fehlgeschlagen: ${data.failedCount}</div>`;
            batchProgressLog.scrollTop = batchProgressLog.scrollHeight;
        }
        
        showMessage(`Batch-Generierung abgeschlossen: ${data.successCount}/${data.totalCategories} erfolgreich`, 
            data.failedCount > 0 ? 'warning' : 'success', 
            'batchGenerateMessage'
        );
        
        batchGenerationActive = false;
        
        // Reload packages list
        loadPackages();
    });

})();
