const ELEMENTS = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];

const SEASON_DURATION_MS = 28 * 24 * 60 * 60 * 1000;
const RANKS = [
  { name: 'Monster Master', minimum: 900 },
  { name: 'Crystal', minimum: 500 },
  { name: 'Gold', minimum: 250 },
  { name: 'Silver', minimum: 100 },
  { name: 'Bronze', minimum: 0 }
];
const QUEST_TITLE_KEYS = Object.freeze({
  'daily:gift': 'questDailyGift',
  'daily:hatch': 'questDailyHatch',
  'daily:chat': 'questDailyChat',
  'weekly:event': 'questWeeklyEvent',
  'weekly:battle': 'questWeeklyBattle',
  'weekly:collection': 'questWeeklyCollection'
});
const ACHIEVEMENT_TITLE_KEYS = Object.freeze({
  first_hatch: 'achievementFirstHatch',
  charged_hatch: 'achievementChargedHatch',
  six_elements: 'achievementSixElements',
  '10_battles': 'achievement10Battles',
  '50_battles': 'achievement50Battles',
  '100_battles': 'achievement100Battles',
  five_win_streak: 'achievementFiveWinStreak'
});

class ProgressionService {
  constructor({ store, emit = () => {}, now = () => new Date() }) {
    this.store = store;
    this.emit = emit;
    this.now = now;
  }

  startStreamSession({ streamKey }) {
    const source = String(streamKey || this.dateKey());
    const index = this.hashNumber(source) % ELEMENTS.length;
    return this.store.createStreamEvent({
      streamKey: source,
      eventId: `elemental-hour:${ELEMENTS[index].toLowerCase()}`,
      element: ELEMENTS[index],
      boostMultiplier: 2,
      startedAtMs: this.currentMs()
    });
  }

  recordGift(userId, streamKey = null) {
    if (streamKey) this.store.markViewerStream(userId, streamKey);
    this.recordFirstAction(userId, streamKey);
    this.incrementQuest(userId, this.dateKey(), 'daily:gift', 'Receive an egg', 1, 1, streamKey, 15, 5);
    this.incrementQuest(userId, this.weekKey(), 'weekly:event', 'Help the stream event', 3, 1, streamKey, 50, 20);
  }

  recordHatch(userId, streamKey = null, monster = null) {
    const target = monster || this.store.getSelectedMonster(userId);
    this.store.awardViewerXp(userId, 20, target?.monster_id);
    this.addSeasonPoints(userId, 2);
    this.incrementQuest(userId, this.dateKey(), 'daily:hatch', 'Hatch a monster', 1, 1, streamKey, 15, 5);
    this.checkHatchAchievements(userId, target);
  }

  recordCommand(userId, streamKey = null) {
    this.recordFirstAction(userId, streamKey);
    this.incrementQuest(userId, this.dateKey(), 'daily:chat', 'Use a Stream Monsters command', 1, 1, streamKey, 15, 5);
  }

  ensureViewerQuests(userId) {
    const daily = [
      ['daily:gift', 'Receive an egg', 1],
      ['daily:hatch', 'Hatch a monster', 1],
      ['daily:chat', 'Use a Stream Monsters command', 1]
    ];
    const weekly = [
      ['weekly:event', 'Help the stream event', 3],
      ['weekly:battle', 'Fight a battle', 10],
      ['weekly:collection', 'Collect all six elements', 6]
    ];
    daily.forEach(([questKey, title, target]) => {
      this.store.upsertQuestProgress({
        userId,
        periodKey: this.dateKey(),
        questKey,
        title,
        target,
        increment: 0
      });
    });
    weekly.forEach(([questKey, title, target]) => {
      this.store.upsertQuestProgress({
        userId,
        periodKey: this.weekKey(),
        questKey,
        title,
        target,
        increment: 0
      });
    });
  }

  recordBattle(userId, streamKey = null, result = {}) {
    const monster = result.monster || this.store.getSelectedMonster(userId);
    if (!monster) return { rewarded: false };
    const won = Boolean(result.won);
    const updated = this.store.recordMonsterBattle(monster.monster_id, won);
    const rewarded = this.store.claimDailyBattleReward(userId, this.dateKey(), 10);
    if (rewarded) {
      this.store.awardMonsterXp(monster.monster_id, 10 + (won ? 5 : 0));
      this.addSeasonPoints(userId, 2 + (won ? 3 : 0));
    }
    this.incrementQuest(userId, this.weekKey(), 'weekly:battle', 'Fight a battle', 10, 1, streamKey, 50, 20);
    this.checkBattleAchievements(userId, updated);
    return { rewarded, monster: this.store.getMonster(monster.monster_id) };
  }

  recordCollection(userId, totalElements, streamKey = null) {
    const quest = this.store.setQuestProgress({
      userId,
      periodKey: this.weekKey(),
      questKey: 'weekly:collection',
      title: 'Collect all six elements',
      target: 6,
      progress: totalElements
    });
    if (quest.completedNow) {
      if (streamKey) this.store.incrementStreamMetric(streamKey, 'quest_completions');
      this.store.awardViewerXp(userId, 50);
      this.addSeasonPoints(userId, 20);
      const messageKey = this.questTitleKey(quest.quest_key);
      this.emit('streammonsters:quest_completed', {
        userId,
        quest: { ...quest, titleKey: messageKey },
        messageKey,
        xpReward: 50,
        seasonReward: 20
      });
    }
    return quest;
  }

  prestige(userId) {
    const elements = new Set(this.store.getViewerMonsters(userId).map(monster => monster.element));
    if (elements.size < ELEMENTS.length) {
      return { success: false, error: 'STREAM_MONSTERS_PRESTIGE_REQUIRES_ALL_ELEMENTS' };
    }
    return { success: true, progress: this.store.resetForPrestige(userId) };
  }

  incrementQuest(
    userId,
    periodKey,
    questKey,
    title,
    target,
    increment = 1,
    streamKey = null,
    xpReward = 0,
    seasonReward = 0
  ) {
    const quest = this.store.upsertQuestProgress({ userId, periodKey, questKey, title, target, increment });
    if (quest.completedNow) {
      if (streamKey) this.store.incrementStreamMetric(streamKey, 'quest_completions');
      if (xpReward) this.store.awardViewerXp(userId, xpReward);
      if (seasonReward) this.addSeasonPoints(userId, seasonReward);
      const messageKey = this.questTitleKey(quest.quest_key);
      this.emit('streammonsters:quest_completed', {
        userId,
        quest: { ...quest, titleKey: messageKey },
        messageKey,
        xpReward,
        seasonReward
      });
    }
    return quest;
  }

  recordFirstAction(userId, streamKey) {
    if (!streamKey || !this.store.claimFirstStreamAction(streamKey, userId, this.currentMs())) return false;
    this.store.awardViewerXp(userId, 2);
    return true;
  }

  getCurrentSeason() {
    const nowMs = this.currentMs();
    const bucket = Math.floor(nowMs / SEASON_DURATION_MS);
    const startsAtMs = bucket * SEASON_DURATION_MS;
    return this.store.ensureSeason({
      seasonId: `season-${bucket}`,
      startsAtMs,
      endsAtMs: startsAtMs + SEASON_DURATION_MS
    });
  }

  addSeasonPoints(userId, points) {
    const season = this.getCurrentSeason();
    const before = this.getViewerSeason(userId);
    const score = this.store.addSeasonPoints(season.season_id, userId, points, this.currentMs());
    const rank = this.rankFor(score.points);
    const cosmetics = this.cosmeticsForRank(rank);
    const persisted = this.store.setSeasonCosmetics(
      season.season_id,
      userId,
      cosmetics,
      this.currentMs()
    );
    const after = { ...persisted, rank };
    if (after.rank !== before.rank) {
      this.emit('streammonsters:season_rank_changed', { userId, before: before.rank, after: after.rank, score: after });
    }
    return after;
  }

  getViewerSeason(userId) {
    const season = this.getCurrentSeason();
    const score = this.store.getSeasonScore(season.season_id, userId);
    const rank = this.rankFor(score.points);
    return { ...score, ...this.cosmeticsForRank(rank), rank, season };
  }

  getLeaderboard(limit = 50) {
    const season = this.getCurrentSeason();
    return this.store.getSeasonLeaderboard(season.season_id, limit)
      .map(score => {
        const rank = this.rankFor(score.points);
        return { ...score, ...this.cosmeticsForRank(rank), rank };
      });
  }

  rankFor(points) {
    return RANKS.find(rank => Number(points) >= rank.minimum).name;
  }

  cosmeticsForRank(rank) {
    const key = String(rank || 'Bronze').toLowerCase().replace(/\s+/g, '-');
    return {
      title: `${rank || 'Bronze'} Collector`,
      badge: key,
      frame: key
    };
  }

  checkHatchAchievements(userId, monster) {
    this.unlock(userId, 'first_hatch');
    const egg = monster?.egg_id ? this.store.getEgg(monster.egg_id) : null;
    if (monster?.variant === 'charged' || egg?.variant === 'charged') this.unlock(userId, 'charged_hatch');
    const elements = new Set(this.store.getViewerMonsters(userId).map(entry => entry.element));
    if (elements.size >= 6) this.unlock(userId, 'six_elements');
  }

  checkBattleAchievements(userId, monster) {
    if (!monster) return;
    const viewerStats = this.store.getViewerBattleStats(userId);
    for (const total of [10, 50, 100]) {
      if (viewerStats.battle_count >= total) this.unlock(userId, `${total}_battles`);
    }
    if (viewerStats.win_streak >= 5) this.unlock(userId, 'five_win_streak');
  }

  unlock(userId, achievementKey) {
    const achievement = this.store.unlockAchievement(userId, achievementKey, this.currentMs());
    if (achievement.unlockedNow) {
      const messageKey = this.achievementTitleKey(achievement.achievement_key);
      this.emit('streammonsters:achievement_unlocked', {
        userId,
        achievement: { ...achievement, titleKey: messageKey },
        messageKey
      });
    }
    return achievement;
  }

  questTitleKey(questKey) {
    return QUEST_TITLE_KEYS[questKey] || 'questUnknown';
  }

  achievementTitleKey(achievementKey) {
    return ACHIEVEMENT_TITLE_KEYS[achievementKey] || 'achievementUnknown';
  }

  dateKey() {
    return this.now().toISOString().slice(0, 10);
  }

  weekKey() {
    const current = new Date(this.now());
    const start = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
    const day = Math.floor((current - start) / 86400000);
    return `${current.getUTCFullYear()}-W${String(Math.floor((day + start.getUTCDay()) / 7) + 1).padStart(2, '0')}`;
  }

  currentMs() {
    return this.now().getTime();
  }

  hashNumber(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

module.exports = ProgressionService;
module.exports.SEASON_DURATION_MS = SEASON_DURATION_MS;
module.exports.RANKS = RANKS;
module.exports.QUEST_TITLE_KEYS = QUEST_TITLE_KEYS;
module.exports.ACHIEVEMENT_TITLE_KEYS = ACHIEVEMENT_TITLE_KEYS;
