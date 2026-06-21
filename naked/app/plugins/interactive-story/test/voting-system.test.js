const VotingSystem = require('../utils/voting-system');

describe('VotingSystem', () => {
  let votingSystem;
  let mockLogger;
  let mockIo;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];
    
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockIo = {
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };

    votingSystem = new VotingSystem(mockLogger, mockIo);
  });

  test('should initialize with inactive state', () => {
    expect(votingSystem.active).toBe(false);
    expect(votingSystem.choices).toEqual([]);
    expect(votingSystem.votes.size).toBe(0);
  });

  test('should start voting session', () => {
    const choices = ['Option A', 'Option B', 'Option C'];
    const result = votingSystem.start(choices);

    expect(votingSystem.active).toBe(true);
    expect(votingSystem.choices).toEqual(choices);
    expect(votingSystem.voteCounts).toEqual([0, 0, 0]);
    expect(result.choices).toEqual(choices);
    expect(emittedEvents[0].event).toBe('story:voting-started');
  });

  test('should process valid vote', () => {
    votingSystem.start(['Choice A', 'Choice B', 'Choice C']);
    
    const accepted = votingSystem.processVote('user1', 'Alice', '!a');
    
    expect(accepted).toBe(true);
    expect(votingSystem.votes.get('user1')).toBe(0);
    expect(votingSystem.voteCounts[0]).toBe(1);
    expect(emittedEvents.some(e => e.event === 'story:vote-update')).toBe(true);
  });

  test('should reject invalid vote command', () => {
    votingSystem.start(['Choice A', 'Choice B']);
    
    const accepted = votingSystem.processVote('user1', 'Alice', 'invalid');
    
    expect(accepted).toBe(false);
    expect(votingSystem.votes.size).toBe(0);
  });

  test('should reject vote when not active', () => {
    const accepted = votingSystem.processVote('user1', 'Alice', '!a');
    
    expect(accepted).toBe(false);
  });

  test('should reject out-of-range vote', () => {
    votingSystem.start(['Choice A', 'Choice B']);
    
    const accepted = votingSystem.processVote('user1', 'Alice', '!d');
    
    expect(accepted).toBe(false);
  });

  test('should allow user to change vote', () => {
    votingSystem.start(['Choice A', 'Choice B', 'Choice C']);
    
    votingSystem.processVote('user1', 'Alice', '!a');
    expect(votingSystem.voteCounts[0]).toBe(1);
    expect(votingSystem.voteCounts[1]).toBe(0);
    
    votingSystem.processVote('user1', 'Alice', '!b');
    expect(votingSystem.voteCounts[0]).toBe(0);
    expect(votingSystem.voteCounts[1]).toBe(1);
  });

  test('should track multiple users', () => {
    votingSystem.start(['Choice A', 'Choice B']);
    
    votingSystem.processVote('user1', 'Alice', '!a');
    votingSystem.processVote('user2', 'Bob', '!a');
    votingSystem.processVote('user3', 'Charlie', '!b');
    
    expect(votingSystem.votes.size).toBe(3);
    expect(votingSystem.voteCounts[0]).toBe(2);
    expect(votingSystem.voteCounts[1]).toBe(1);
  });

  test('should end voting and determine winner', () => {
    votingSystem.start(['Choice A', 'Choice B', 'Choice C']);
    
    votingSystem.processVote('user1', 'Alice', '!a');
    votingSystem.processVote('user2', 'Bob', '!a');
    votingSystem.processVote('user3', 'Charlie', '!b');
    
    const results = votingSystem.end();
    
    expect(results.winnerIndex).toBe(0);
    expect(results.winnerText).toBe('Choice A');
    expect(results.totalVotes).toBe(3);
    expect(results.voteCounts).toEqual([2, 1, 0]);
    expect(votingSystem.active).toBe(false);
    expect(emittedEvents.some(e => e.event === 'story:voting-ended')).toBe(true);
  });

  test('should handle tie by selecting first option', () => {
    votingSystem.start(['Choice A', 'Choice B']);
    
    votingSystem.processVote('user1', 'Alice', '!a');
    votingSystem.processVote('user2', 'Bob', '!b');
    
    const results = votingSystem.end();
    
    expect(results.winnerIndex).toBe(0);
  });

  test('should get current status', () => {
    votingSystem.start(['Choice A', 'Choice B'], { votingDuration: 60 });
    votingSystem.processVote('user1', 'Alice', '!a');
    
    const status = votingSystem.getStatus();
    
    expect(status.active).toBe(true);
    expect(status.choices).toEqual(['Choice A', 'Choice B']);
    expect(status.totalVotes).toBe(1);
    expect(status.voteCounts).toEqual([1, 0]);
    expect(status.timeRemaining).toBeGreaterThan(0);
  });

  test('should update settings', () => {
    votingSystem.updateSettings({ votingDuration: 120, minVotes: 10 });
    
    expect(votingSystem.settings.votingDuration).toBe(120);
    expect(votingSystem.settings.minVotes).toBe(10);
  });

  test('should get vote commands', () => {
    votingSystem.start(['A', 'B', 'C', 'D']);
    
    const commands = votingSystem.getVoteCommands();
    
    expect(commands).toEqual(['!a', '!b', '!c', '!d']);
  });

  test('should return empty commands when inactive', () => {
    const commands = votingSystem.getVoteCommands();
    
    expect(commands).toEqual([]);
  });

  test('should stop voting without ending', () => {
    votingSystem.start(['Choice A', 'Choice B']);
    votingSystem.processVote('user1', 'Alice', '!a');
    
    votingSystem.stop();
    
    expect(votingSystem.active).toBe(false);
    expect(emittedEvents.some(e => e.event === 'story:voting-stopped')).toBe(true);
  });

  test('should handle case-insensitive votes', () => {
    votingSystem.start(['Choice A', 'Choice B']);
    
    const accepted1 = votingSystem.processVote('user1', 'Alice', '!A');
    const accepted2 = votingSystem.processVote('user2', 'Bob', '!B');
    
    expect(accepted1).toBe(true);
    expect(accepted2).toBe(true);
    expect(votingSystem.voteCounts).toEqual([1, 1]);
  });

  test('should auto-end after timer', (done) => {
    jest.useFakeTimers();
    
    votingSystem.start(['Choice A', 'Choice B'], { votingDuration: 1 });
    
    expect(votingSystem.active).toBe(true);
    
    jest.advanceTimersByTime(1100);
    
    setTimeout(() => {
      expect(votingSystem.active).toBe(false);
      jest.useRealTimers();
      done();
    }, 100);
    
    jest.runOnlyPendingTimers();
  });

  test('should stop previous vote when starting new one', () => {
    votingSystem.start(['Choice A', 'Choice B']);
    expect(votingSystem.active).toBe(true);
    
    votingSystem.start(['Choice C', 'Choice D']);
    expect(votingSystem.choices).toEqual(['Choice C', 'Choice D']);
    expect(votingSystem.votes.size).toBe(0);
  });

  test('should call onVoteEnded callback and not expose it in status', () => {
    const onVoteEnded = jest.fn();
    votingSystem.start(['Choice A', 'Choice B'], { onVoteEnded });
    
    votingSystem.processVote('user1', 'Alice', '!a');
    const results = votingSystem.end();
    
    expect(onVoteEnded).toHaveBeenCalledWith(results);
    
    const status = votingSystem.getStatus();
    expect(Object.prototype.hasOwnProperty.call(status.settings, 'onVoteEnded')).toBe(false);
  });
});
