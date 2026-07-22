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

  getChoice(userId) {
    if (!userId) return null;
    try {
      const row = this.db.prepare(
        'SELECT user_id, username, selection_json, state, created_at, updated_at FROM talking_heads_avatar_lottery WHERE user_id = ?'
      ).get(String(userId));
      if (!row) return null;

      const selection = JSON.parse(row.selection_json);
      if (!selection || typeof selection !== 'object') return null;
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

  shouldDraw(choice) {
    return !choice || choice.state !== 'kept';
  }

  draw(userId, username, selection) {
    if (!userId || !selection || typeof selection !== 'object') {
      throw new Error('A user ID and asset selection are required for an avatar lottery draw');
    }

    const now = Date.now();
    const safeUserId = String(userId);
    const safeUsername = String(username || userId).slice(0, 50);
    const serializedSelection = JSON.stringify(selection);
    this.db.prepare(`
      INSERT INTO talking_heads_avatar_lottery (
        user_id, username, selection_json, state, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        selection_json = excluded.selection_json,
        state = 'pending',
        updated_at = excluded.updated_at
    `).run(safeUserId, safeUsername, serializedSelection, now, now);

    return {
      userId: safeUserId,
      username: safeUsername,
      selection,
      state: 'pending',
      createdAt: now,
      updatedAt: now
    };
  }

  applyCommand(userId, command) {
    const normalizedCommand = String(command || '').trim().toLowerCase();
    const nextState = normalizedCommand === '!keep'
      ? 'kept'
      : normalizedCommand === '!reroll'
        ? 'reroll_armed'
        : null;
    if (!nextState) return null;

    const choice = this.getChoice(userId);
    if (!choice) return null;

    const updatedAt = Date.now();
    this.db.prepare(
      'UPDATE talking_heads_avatar_lottery SET state = ?, updated_at = ? WHERE user_id = ?'
    ).run(nextState, updatedAt, choice.userId);

    return { ...choice, state: nextState, updatedAt };
  }
}

module.exports = AvatarLotteryManager;
