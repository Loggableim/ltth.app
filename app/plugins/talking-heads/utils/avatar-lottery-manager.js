class AvatarLotteryManager {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
  }

  init() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS talking_heads_avatar_lottery (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        selection_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'kept', 'reroll_armed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
  }

  getAssignment(userId) {
    if (!userId) return null;
    try {
      const row = this.db.prepare(
        'SELECT user_id, username, selection_json, state, created_at, updated_at FROM talking_heads_avatar_lottery WHERE user_id = ?'
      ).get(String(userId));
      if (!row) return null;

      const selection = JSON.parse(row.selection_json);
      if (!this._isValidSelection(selection)) return null;
      return {
        userId: row.user_id,
        username: row.username,
        selection,
        state: row.state,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      this.logger?.warn?.(`TalkingHeads: Could not read avatar lottery choice: ${error.message}`);
      return null;
    }
  }

  getChoice(userId) {
    return this.getAssignment(userId);
  }

  assign(userId, username, selection) {
    if (!userId || !this._isValidSelection(selection)) {
      throw new Error('A user ID and valid asset selection are required for an avatar assignment');
    }

    const now = Date.now();
    const safeUserId = String(userId);
    const safeUsername = String(username || userId).slice(0, 50);
    const serializedSelection = JSON.stringify(selection);
    const existing = this.getAssignment(safeUserId);
    this.db.prepare(`
      INSERT INTO talking_heads_avatar_lottery (
        user_id, username, selection_json, state, created_at, updated_at
      ) VALUES (?, ?, ?, 'kept', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        selection_json = excluded.selection_json,
        state = 'kept',
        updated_at = excluded.updated_at
    `).run(safeUserId, safeUsername, serializedSelection, now, now);

    return {
      userId: safeUserId,
      username: safeUsername,
      selection,
      state: 'kept',
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
  }

  reroll(userId, username, selection) {
    const current = this.getAssignment(userId);
    if (!current || !this._isValidSelection(selection) || this._sameSelection(current.selection, selection)) {
      return null;
    }
    return this.assign(userId, username || current.username, selection);
  }

  _isValidSelection(selection) {
    return !!selection
      && typeof selection === 'object'
      && typeof selection.packId === 'string'
      && selection.packId.length > 0
      && typeof selection.characterId === 'string'
      && selection.characterId.length > 0
      && (selection.options === undefined || (
        selection.options
        && typeof selection.options === 'object'
        && !Array.isArray(selection.options)
      ));
  }

  _sameSelection(left, right) {
    return left.packId === right.packId
      && left.characterId === right.characterId
      && JSON.stringify(left.options || {}) === JSON.stringify(right.options || {});
  }
}

module.exports = AvatarLotteryManager;
