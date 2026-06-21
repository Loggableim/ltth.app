/**
 * Voting System
 * Handles chat-based voting with !a, !b, !c commands
 */
class VotingSystem {
  constructor(logger, io) {
    this.logger = logger;
    this.io = io;
    this.reset();
  }

  /**
   * Reset voting state
   */
  reset() {
    this.active = false;
    this.choices = [];
    this.votes = new Map(); // userId -> choiceIndex
    this.voteCounts = [];
    this.startTime = null;
    this.endTime = null;
    this.timerHandle = null;
    this.onVoteEnded = null;
    this.settings = {
      votingDuration: 60, // seconds
      minVotes: 5,
      useMinSwing: false,
      swingThreshold: 10, // votes
      voteKeywordPattern: '!letter', // Default: !a, !b, !c
      caseSensitive: false // Default: case-insensitive
    };
  }

  /**
   * Start a new voting session
   * @param {Array} choices - Array of choice strings
   * @param {Object} settings - Optional voting settings
   */
  start(choices, settings = {}) {
    if (this.active) {
      this.logger.warn('Voting already active, stopping previous vote');
      this.stop();
    }

    const { onVoteEnded, ...settingsWithoutCallback } = settings;

    this.choices = choices;
    this.votes.clear();
    this.voteCounts = new Array(choices.length).fill(0);
    this.settings = { ...this.settings, ...settingsWithoutCallback };
    this.onVoteEnded = typeof onVoteEnded === 'function' ? onVoteEnded : null;
    this.active = true;
    this.startTime = Date.now();
    this.endTime = this.startTime + (this.settings.votingDuration * 1000);

    this.logger.info(`Voting started: ${choices.length} choices, ${this.settings.votingDuration}s duration, pattern: ${this.settings.voteKeywordPattern}`);

    // Emit voting started event
    this.io.emit('story:voting-started', {
      choices: this.choices,
      duration: this.settings.votingDuration,
      endsAt: this.endTime,
      voteKeywordPattern: this.settings.voteKeywordPattern || '!letter',
      caseSensitive: this.settings.caseSensitive || false
    });

    // Auto-end timer
    this.timerHandle = setTimeout(() => {
      this.end();
    }, this.settings.votingDuration * 1000);

    return {
      choices: this.choices,
      endsAt: this.endTime
    };
  }

  /**
   * Process a vote from chat
   * @param {string} userId - Unique user ID
   * @param {string} username - Display name
   * @param {string} voteCommand - Vote command (!a, !b, !c, etc.)
   * @returns {boolean} - Was vote accepted
   */
  processVote(userId, username, voteCommand) {
    if (!this.active) {
      return false;
    }

    // Parse vote command based on keyword pattern
    const choiceIndex = this._parseVoteCommand(voteCommand);
    
    // Validate choice index
    if (choiceIndex === null || choiceIndex < 0 || choiceIndex >= this.choices.length) {
      this.logger.debug(`Invalid vote from ${username}: ${voteCommand} (out of range or invalid format)`);
      return false;
    }

    // Check if user already voted
    const previousVote = this.votes.get(userId);
    if (previousVote !== undefined) {
      // Remove previous vote
      this.voteCounts[previousVote]--;
    }

    // Record new vote
    this.votes.set(userId, choiceIndex);
    this.voteCounts[choiceIndex]++;

    this.logger.debug(`Vote recorded: ${username} -> ${voteCommand} (Choice ${choiceIndex})`);

    // Emit vote update
    this.io.emit('story:vote-update', {
      voteCounts: this.voteCounts,
      totalVotes: this.votes.size,
      choices: this.choices
    });

    // Check for early end conditions
    this._checkEarlyEnd();

    return true;
  }
  
  /**
   * Parse vote command based on configured keyword pattern
   * @param {string} voteCommand - The vote command from chat
   * @returns {number|null} - Choice index (0-based) or null if invalid
   */
  _parseVoteCommand(voteCommand) {
    const pattern = this.settings.voteKeywordPattern || '!letter';
    const caseSensitive = this.settings.caseSensitive || false;
    
    // Normalize for comparison if case-insensitive
    const cmd = caseSensitive ? voteCommand : voteCommand.toLowerCase();
    
    // Get max index based on actual number of choices
    const maxIndex = this.choices.length - 1;
    
    switch (pattern) {
      case '!letter': {
        // Match: !a, !b, !c, !d, !e, !f
        const match = cmd.match(/^!([a-f])$/);
        if (!match) return null;
        const index = match[1].charCodeAt(0) - 'a'.charCodeAt(0);
        return index <= maxIndex ? index : null;
      }
      
      case 'letter': {
        // Match: A, B, C, D, E, F (or a, b, c, d, e, f if case-insensitive)
        const match = cmd.match(/^([a-f])$/);
        if (!match) return null;
        const index = match[1].charCodeAt(0) - 'a'.charCodeAt(0);
        return index <= maxIndex ? index : null;
      }
      
      case 'number': {
        // Match: 1, 2, 3, 4, 5, 6
        const match = cmd.match(/^([1-6])$/);
        if (!match) return null;
        const index = parseInt(match[1]) - 1; // Convert to 0-based index
        return index <= maxIndex ? index : null;
      }
      
      case 'antwort': {
        // Match: Antwort 1, Antwort 2, etc. (case-insensitive unless caseSensitive is true)
        const match = cmd.match(/^antwort\s*([1-6])$/);
        if (!match) return null;
        const index = parseInt(match[1]) - 1;
        return index <= maxIndex ? index : null;
      }
      
      case 'answer': {
        // Match: Answer 1, Answer 2, etc. (case-insensitive unless caseSensitive is true)
        const match = cmd.match(/^answer\s*([1-6])$/);
        if (!match) return null;
        const index = parseInt(match[1]) - 1;
        return index <= maxIndex ? index : null;
      }
      
      default:
        // Fallback to !letter pattern
        const match = cmd.match(/^!([a-f])$/);
        if (!match) return null;
        const index = match[1].charCodeAt(0) - 'a'.charCodeAt(0);
        return index <= maxIndex ? index : null;
    }
  }

  /**
   * Check if voting should end early
   */
  _checkEarlyEnd() {
    if (!this.settings.useMinSwing) {
      return;
    }

    // Check if any option has overwhelming lead
    const maxVotes = Math.max(...this.voteCounts);
    const secondMax = this.voteCounts
      .filter(v => v !== maxVotes)
      .reduce((max, v) => Math.max(max, v), 0);

    const swing = maxVotes - secondMax;

    if (swing >= this.settings.swingThreshold && this.votes.size >= this.settings.minVotes) {
      this.logger.info(`Early voting end: Swing threshold reached (${swing} votes)`);
      this.end();
    }
  }

  /**
   * End voting and determine winner
   * @returns {Object} - Results
   */
  end() {
    if (!this.active) {
      this.logger.warn('Voting end called but no active vote');
      return null;
    }

    this.active = false;
    
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    // Determine winner
    const maxVotes = Math.max(...this.voteCounts);
    const winnerIndex = this.voteCounts.indexOf(maxVotes);
    
    const results = {
      winnerIndex: winnerIndex,
      winnerText: this.choices[winnerIndex],
      voteCounts: [...this.voteCounts],
      totalVotes: this.votes.size,
      choices: [...this.choices],
      duration: (Date.now() - this.startTime) / 1000
    };

    this.logger.info(`Voting ended: Winner is choice ${winnerIndex} with ${maxVotes} votes`);

    // Emit results
    this.io.emit('story:voting-ended', results);
    
    // Notify callback for server-side handling
    if (this.onVoteEnded) {
      try {
        this.onVoteEnded(results);
      } catch (error) {
        this.logger.error(`Error in voting end callback: ${error.message}`);
      } finally {
        this.onVoteEnded = null;
      }
    }

    return results;
  }

  /**
   * Force stop voting without results
   */
  stop() {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    
    this.active = false;
    // Clear any pending callback when voting is cancelled to avoid stale handlers
    this.onVoteEnded = null;
    this.io.emit('story:voting-stopped', {});
    this.logger.info('Voting stopped');
  }

  /**
   * Get current voting status
   * @returns {Object} - Current status
   */
  getStatus() {
    return {
      active: this.active,
      choices: this.choices,
      voteCounts: this.voteCounts,
      totalVotes: this.votes.size,
      timeRemaining: this.active ? Math.max(0, this.endTime - Date.now()) / 1000 : 0,
      settings: this.settings
    };
  }

  /**
   * Get top voters (users with most participation)
   * @param {number} limit - Number of top voters to return
   * @returns {Array} - Top voters
   */
  getTopVoters(limit = 10) {
    // This would need to track across sessions
    // For now, return current session voters
    const voters = Array.from(this.votes.entries()).map(([userId, choice]) => ({
      userId,
      choice,
      participated: true
    }));

    return voters.slice(0, limit);
  }

  /**
   * Update voting settings
   * @param {Object} settings - New settings
   */
  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.logger.info('Voting settings updated:', settings);
  }

  /**
   * Is voting currently active
   * @returns {boolean}
   */
  isActive() {
    return this.active;
  }

  /**
   * Get available vote commands for current voting
   * @returns {Array} - Array of command strings
   */
  getVoteCommands() {
    if (!this.active) return [];
    
    const pattern = this.settings.voteKeywordPattern || '!letter';
    
    return this.choices.map((_, index) => {
      return this._getVoteKeywordForIndex(index, pattern);
    });
  }
  
  /**
   * Get vote keyword for a specific choice index
   * @param {number} index - Choice index (0-based)
   * @param {string} pattern - Vote keyword pattern
   * @returns {string} - Vote keyword
   */
  _getVoteKeywordForIndex(index, pattern) {
    pattern = pattern || this.settings.voteKeywordPattern || '!letter';
    
    switch (pattern) {
      case '!letter':
        return `!${String.fromCharCode('a'.charCodeAt(0) + index)}`;
      
      case 'letter':
        return String.fromCharCode('A'.charCodeAt(0) + index);
      
      case 'number':
        return String(index + 1);
      
      case 'antwort':
        return `Antwort ${index + 1}`;
      
      case 'answer':
        return `Answer ${index + 1}`;
      
      default:
        return `!${String.fromCharCode('a'.charCodeAt(0) + index)}`;
    }
  }
}

module.exports = VotingSystem;
