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
        addListener('saveOpenAIConfigBtn', 'click', saveOpenAIConfig);
        addListener('testOpenAIKeyBtn', 'click', testOpenAIKey);
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
    function startQuiz() {
        socket.emit('quiz-show:start');
    }

    function nextQuestion() {
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
            joker50Enabled: document.getElementById('joker50Enabled').checked,
            jokerInfoEnabled: document.getElementById('jokerInfoEnabled').checked,
            jokerTimeEnabled: document.getElementById('jokerTimeEnabled').checked,
            jokerTimeBoost: parseInt(document.getElementById('jokerTimeBoost').value),
            jokersPerRound: parseInt(document.getElementById('jokersPerRound').value),
            ttsEnabled: document.getElementById('ttsEnabled').checked,
            ttsVoice: document.getElementById('ttsVoice').value,
            marathonLength: parseInt(document.getElementById('marathonLength').value),
            gameMode: document.getElementById('gameModeSelect').value,
            categoryFilter: document.getElementById('categoryFilter').value,
            autoMode: document.getElementById('autoMode').checked,
            autoModeDelay: parseInt(document.getElementById('autoModeDelay').value),
            answerDisplayDuration: parseInt(document.getElementById('answerDisplayDuration').value),
            // Voter Icons Settings
            voterIconsEnabled: document.getElementById('voterIconsEnabled').checked,
            voterIconSize: document.getElementById('voterIconSize').value,
            voterIconMaxVisible: parseInt(document.getElementById('voterIconMaxVisible').value),
            voterIconCompactMode: document.getElementById('voterIconCompactMode').checked,
            voterIconAnimation: document.getElementById('voterIconAnimation').value,
            voterIconPosition: document.getElementById('voterIconPosition').value,
            voterIconShowOnScoreboard: document.getElementById('voterIconShowOnScoreboard').checked
        };

        try {
            const response = await fetch('/api/quiz-show/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const data = await response.json();

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
        document.getElementById('joker50Enabled').checked = config.joker50Enabled !== false;
        document.getElementById('jokerInfoEnabled').checked = config.jokerInfoEnabled !== false;
        document.getElementById('jokerTimeEnabled').checked = config.jokerTimeEnabled !== false;
        document.getElementById('jokerTimeBoost').value = config.jokerTimeBoost || 15;
        document.getElementById('jokersPerRound').value = config.jokersPerRound || 3;
        document.getElementById('ttsEnabled').checked = config.ttsEnabled || false;
        document.getElementById('ttsVoice').value = config.ttsVoice || 'default';
        document.getElementById('marathonLength').value = config.marathonLength || 15;
        document.getElementById('gameModeSelect').value = config.gameMode || 'classic';
        document.getElementById('categoryFilter').value = config.categoryFilter || 'Alle';
        document.getElementById('autoMode').checked = config.autoMode || false;
        document.getElementById('autoModeDelay').value = config.autoModeDelay || 5;
        document.getElementById('answerDisplayDuration').value = config.answerDisplayDuration || 5;
        
        // Voter Icons Settings
        document.getElementById('voterIconsEnabled').checked = config.voterIconsEnabled !== false;
        document.getElementById('voterIconSize').value = config.voterIconSize || 'medium';
        document.getElementById('voterIconMaxVisible').value = config.voterIconMaxVisible || 10;
        document.getElementById('voterIconCompactMode').checked = config.voterIconCompactMode !== false;
        document.getElementById('voterIconAnimation').value = config.voterIconAnimation || 'fade';
        document.getElementById('voterIconPosition').value = config.voterIconPosition || 'above';
        document.getElementById('voterIconShowOnScoreboard').checked = config.voterIconShowOnScoreboard || false;
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
                    <button class="btn-icon" onclick="window.quizShow.editQuestion(${q.id})" title="Bearbeiten">✏️</button>
                    <button class="btn-icon" onclick="window.quizShow.deleteQuestion(${q.id})" title="Löschen">🗑️</button>
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

        // Stream Resolution
        const resolution = `${hudConfig.streamWidth || 1920}x${hudConfig.streamHeight || 1080}`;
        document.getElementById('streamResolution').value = resolution;
        updatePreviewScale(resolution);
    }

    function getHUDConfigFromForm() {
        const resolution = document.getElementById('streamResolution').value.split('x');

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
            streamWidth: parseInt(resolution[0]),
            streamHeight: parseInt(resolution[1]),
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
                showMessage('hudSaveMessage', 'HUD-Konfiguration erfolgreich gespeichert!', 'success');
                refreshPreview();
            } else {
                showMessage('hudSaveMessage', 'Fehler beim Speichern: ' + data.error, 'error');
            }
        } catch (error) {
            showMessage('hudSaveMessage', 'Netzwerkfehler: ' + error.message, 'error');
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
                showMessage('hudSaveMessage', 'HUD-Konfiguration auf Standard zurückgesetzt!', 'success');
                refreshPreview();
            } else {
                showMessage('hudSaveMessage', 'Fehler beim Zurücksetzen: ' + data.error, 'error');
            }
        } catch (error) {
            showMessage('hudSaveMessage', 'Netzwerkfehler: ' + error.message, 'error');
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
        document.getElementById('resetHUDConfigBtn').addEventListener('click', resetHUDConfig);
        document.getElementById('openOverlayBtn').addEventListener('click', openOverlay);
        document.getElementById('refreshPreviewBtn').addEventListener('click', refreshPreview);

        // Range sliders
        document.getElementById('animationSpeed').addEventListener('input', (e) => {
            document.getElementById('animationSpeedValue').textContent = parseFloat(e.target.value).toFixed(1);
        });

        document.getElementById('glowIntensity').addEventListener('input', (e) => {
            document.getElementById('glowIntensityValue').textContent = parseFloat(e.target.value).toFixed(1);
        });

        document.getElementById('streamResolution').addEventListener('change', (e) => {
            updatePreviewScale(e.target.value);
        });

        // Load HUD config when HUD tab is opened
        const hudTab = document.querySelector('[data-tab="hud"]');
        if (hudTab) {
            hudTab.addEventListener('click', () => {
                setTimeout(() => {
                    loadHUDConfig();
                }, 100);
            });
        }
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
                const categoryFilter = document.getElementById('categoryFilter');
                
                // Update datalist for question editor
                categoryList.innerHTML = data.categories.map(cat => 
                    `<option value="${escapeHtml(cat)}"></option>`
                ).join('');
                
                // Update category filter dropdown
                const currentFilter = categoryFilter.value;
                categoryFilter.innerHTML = '<option value="Alle">Alle Kategorien</option>' + 
                    data.categories.map(cat => 
                        `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
                    ).join('');
                categoryFilter.value = currentFilter || 'Alle';
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
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
        try {
            const response = await fetch('/api/quiz-show/openai/config');
            const data = await response.json();

            if (data.success && data.config) {
                const config = data.config;
                
                // Update status badge
                const statusBadge = document.getElementById('apiKeyStatus');
                if (statusBadge) {
                    if (config.hasApiKey) {
                        statusBadge.textContent = `✓ Konfiguriert (${config.apiKeyPreview})`;
                        statusBadge.className = 'status-badge status-connected';
                        statusBadge.style.display = 'inline-block';
                        
                        // Hide warning, show generation form
                        const warning = document.getElementById('generateWarning');
                        if (warning) warning.style.display = 'none';
                    } else {
                        statusBadge.textContent = '✗ Nicht konfiguriert';
                        statusBadge.className = 'status-badge status-error';
                        statusBadge.style.display = 'inline-block';
                        
                        // Show warning
                        const warning = document.getElementById('generateWarning');
                        if (warning) warning.style.display = 'block';
                    }
                }

                // Update form fields
                document.getElementById('openaiModel').value = config.model || 'gpt-5-mini';
                document.getElementById('defaultPackageSize').value = config.defaultPackageSize || 10;
                document.getElementById('packageSize').value = config.defaultPackageSize || 10;
            }
        } catch (error) {
            console.error('Error loading OpenAI config:', error);
        }
    }

    async function saveOpenAIConfig() {
        const apiKey = document.getElementById('openaiApiKey').value.trim();
        const model = document.getElementById('openaiModel').value;
        const defaultPackageSize = parseInt(document.getElementById('defaultPackageSize').value);

        try {
            const response = await fetch('/api/quiz-show/openai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: apiKey || undefined,
                    model,
                    defaultPackageSize
                })
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Konfiguration erfolgreich gespeichert', 'success', 'openaiConfigMessage');
                // Clear the password field
                document.getElementById('openaiApiKey').value = '';
                // Reload config to update status
                await loadOpenAIConfig();
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'openaiConfigMessage');
            }
        } catch (error) {
            console.error('Error saving OpenAI config:', error);
            showMessage('Fehler beim Speichern', 'error', 'openaiConfigMessage');
        }
    }

    async function testOpenAIKey() {
        const apiKey = document.getElementById('openaiApiKey').value.trim();

        if (!apiKey) {
            showMessage('Bitte geben Sie einen API-Schlüssel ein', 'error', 'openaiConfigMessage');
            return;
        }

        try {
            // Show loading state
            const btn = document.getElementById('testOpenAIKeyBtn');
            const originalText = btn.textContent;
            btn.textContent = '🔄 Teste...';
            btn.disabled = true;

            // For now, we'll just try to save it which will test it
            const response = await fetch('/api/quiz-show/openai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey })
            });

            const data = await response.json();
            
            btn.textContent = originalText;
            btn.disabled = false;

            if (data.success) {
                showMessage('✓ API-Schlüssel ist gültig!', 'success', 'openaiConfigMessage');
                document.getElementById('openaiApiKey').value = '';
                await loadOpenAIConfig();
            } else {
                showMessage('✗ ' + data.error, 'error', 'openaiConfigMessage');
            }
        } catch (error) {
            console.error('Error testing API key:', error);
            showMessage('Fehler beim Testen', 'error', 'openaiConfigMessage');
            document.getElementById('testOpenAIKeyBtn').disabled = false;
        }
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
                    class="package-checkbox" 
                    ${pkg.is_selected ? 'checked' : ''}
                    onchange="window.quizShow.togglePackage(${pkg.id})"
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
                    <button class="btn-view" onclick="window.quizShow.viewPackageQuestions(${pkg.id})" title="Fragen anzeigen">
                        👁️ Anzeigen
                    </button>
                    <button class="btn-delete" onclick="window.quizShow.deletePackage(${pkg.id})" title="Paket löschen">
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

    // Expose functions to window for onclick handlers
    window.quizShow = {
        editQuestion,
        deleteQuestion,
        togglePackage,
        deletePackage,
        viewPackageQuestions
    };
})();
