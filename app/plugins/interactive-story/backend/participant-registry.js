/**
 * Participant state for Interactive Story pen-and-paper sessions.
 */
const ROLE_CATALOG = Object.freeze([
  { id: 'warrior', name: 'Warrior' },
  { id: 'mage', name: 'Mage' },
  { id: 'rogue', name: 'Rogue' },
  { id: 'healer', name: 'Healer' },
  { id: 'ranger', name: 'Ranger' },
  { id: 'bard', name: 'Bard' }
]);

class ParticipantRegistry {
  constructor(database, options = {}) {
    this.database = database;
    this.selectRole = typeof options.selectRole === 'function'
      ? options.selectRole
      : roles => roles[Math.floor(Math.random() * roles.length)];
    this.inactivityLimitRounds = Number.isInteger(options.inactivityLimitRounds)
      ? options.inactivityLimitRounds
      : 2;
  }

  join(sessionId, userId, username, round) {
    const existing = this.database.getParticipant(sessionId, userId);
    if (existing) {
      return this._toSnapshot(existing);
    }

    const selectedRole = this.selectRole(ROLE_CATALOG.slice());
    const role = ROLE_CATALOG.find(candidate => candidate.id === selectedRole?.id) || ROLE_CATALOG[0];
    const participant = this.database.createParticipant(sessionId, {
      userId,
      username,
      roleId: role.id,
      roleName: role.name,
      joinedRound: round
    });

    return this._toSnapshot(participant);
  }

  recordVote(sessionId, userId, round) {
    const participant = this.database.recordParticipantVote(sessionId, userId, round);
    return participant ? this._toSnapshot(participant) : null;
  }

  resolveRound(sessionId, round) {
    const result = this.database.resolveParticipantRound(
      sessionId,
      round,
      this.inactivityLimitRounds
    );
    return {
      updated: result.updated.map(participant => this._toSnapshot(participant)),
      eliminated: result.eliminated.map(participant => this._toSnapshot(participant))
    };
  }

  list(sessionId, { includeEliminated = false } = {}) {
    return this.database
      .listParticipants(sessionId, { includeEliminated })
      .map(participant => this._toSnapshot(participant));
  }

  _toSnapshot(participant) {
    return {
      username: participant.username,
      roleId: participant.role_id,
      roleName: participant.role_name,
      joinedRound: participant.joined_round,
      missedRounds: participant.missed_rounds,
      status: participant.status
    };
  }
}

ParticipantRegistry.ROLE_CATALOG = ROLE_CATALOG;

module.exports = ParticipantRegistry;