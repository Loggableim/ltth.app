class NextSongVote {
  constructor(options = {}) {
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : null;
    this.state = this._emptyState();
  }

  open(candidates, closesAt) {
    const validCandidates = Array.isArray(candidates) ? candidates.slice(0, 2).filter(Boolean) : [];
    if (validCandidates.length !== 2 || !validCandidates[0].id || !validCandidates[1].id) {
      throw new Error('A next-song vote needs exactly two candidates with stable IDs');
    }
    const safeClosesAt = Number(closesAt);
    if (!Number.isFinite(safeClosesAt) || safeClosesAt <= this.now()) {
      throw new Error('A next-song vote needs a future closing timestamp');
    }
    this.state = {
      status: 'open',
      candidates: validCandidates.map((candidate) => ({ ...candidate })),
      votesByUser: new Map(),
      closesAt: safeClosesAt,
      winner: null,
      reason: null
    };
    return this._emit();
  }

  cast(username, choice) {
    if (this._autoCloseIfDue()) return { accepted: false, reason: 'closed', vote: this.getStatus() };
    if (this.state.status !== 'open') {
      return {
        accepted: false,
        reason: this.state.status === 'closed' ? 'closed' : 'inactive',
        vote: this.getStatus()
      };
    }
    const userKey = String(username || '').trim().toLowerCase();
    const index = Number(choice);
    if (!userKey || ![1, 2].includes(index)) return { accepted: false, reason: 'invalid', vote: this.getStatus() };
    const previous = this.state.votesByUser.get(userKey) || null;
    this.state.votesByUser.set(userKey, index);
    const vote = this._emit();
    return { accepted: true, replaced: previous !== null && previous !== index, vote };
  }

  close(reason = 'timer') {
    if (this.state.status !== 'open') return this.getStatus();
    const totals = this._totals();
    const winnerIndex = totals[2] > totals[1] ? 2 : 1;
    this.state.status = 'closed';
    this.state.winner = { ...this.state.candidates[winnerIndex - 1] };
    this.state.reason = reason;
    return this._emit();
  }

  cancel(reason = 'cancelled') {
    if (this.state.status !== 'open') return this.getStatus();
    this.state.status = 'cancelled';
    this.state.winner = null;
    this.state.reason = reason;
    return this._emit();
  }

  consumeWinner() {
    this._autoCloseIfDue();
    if (this.state.status !== 'closed' || !this.state.winner) return null;
    const winner = { ...this.state.winner };
    this.state = this._emptyState();
    this._emit();
    return winner;
  }

  getStatus() {
    this._autoCloseIfDue();
    const totals = this._totals();
    return {
      status: this.state.status,
      candidates: this.state.candidates.map((candidate) => ({ ...candidate })),
      votes: { 1: totals[1], 2: totals[2] },
      closesAt: this.state.closesAt,
      winner: this.state.winner ? { ...this.state.winner } : null,
      reason: this.state.reason
    };
  }

  _autoCloseIfDue() {
    if (this.state.status !== 'open' || this.now() < this.state.closesAt) return false;
    this.close('timer');
    return true;
  }

  _totals() {
    const totals = { 1: 0, 2: 0 };
    this.state.votesByUser.forEach((choice) => {
      if (choice === 1 || choice === 2) totals[choice] += 1;
    });
    return totals;
  }

  _emptyState() {
    return {
      status: 'idle',
      candidates: [],
      votesByUser: new Map(),
      closesAt: null,
      winner: null,
      reason: null
    };
  }

  _emit() {
    const snapshot = this.getStatus();
    this.onUpdate?.(snapshot);
    return snapshot;
  }
}

module.exports = NextSongVote;
