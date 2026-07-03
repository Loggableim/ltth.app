// Minimal stub for QuizShowPlugin used in tests
const fs = require('fs');
const path = require('path');

class QuizShowStub {
    constructor() {
        this.config = {};
        this.api = { emit: jest.fn(), log: jest.fn() };
        this.db = { prepare: () => ({ all: () => [], get: () => ({}) }) };
        this.gameState = {
            currentRound: 0,
            lastManStanding: {
                active: false,
                joinPhase: false,
                survivors: new Set(),
                eliminated: new Set(),
                joinEndTime: null,
                currentRoundTime: null
            }
        };
        this.lastManStanding = this.gameState.lastManStanding;
    }

    // Stubbed LMS methods
    startLMSJoinPhase() { this.lastManStanding.active = true; this.lastManStanding.joinPhase = true; }
    endLMSJoinPhase() { this.lastManStanding.joinPhase = false; }
    handleLMSJoin(userId) { this.lastManStanding.survivors.add(userId); }
    autoJoinLMS(userId) { this.lastManStanding.survivors.add(userId); }
    getLMSTimerDuration() { return 10; }
    eliminateLMSPlayer(userId) { this.lastManStanding.survivors.delete(userId); this.lastManStanding.eliminated.add(userId); }
    handleLMSWinner(userId) { this.api.emit('quiz-show:lms-winner', { userId }); }
}

module.exports = QuizShowStub;
