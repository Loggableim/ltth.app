const ELEMENTS = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];

class ProgressionService {
  constructor({ store, now = () => new Date() }) {
    this.store = store;
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
    this.incrementQuest(userId, this.dateKey(), 'daily:gift', 'Receive an egg', 1, 1, streamKey);
    this.incrementQuest(userId, this.weekKey(), 'weekly:event', 'Help the stream event', 3, 1, streamKey);
  }

  recordHatch(userId, streamKey = null) {
    this.incrementQuest(userId, this.dateKey(), 'daily:hatch', 'Hatch a monster', 1, 1, streamKey);
  }

  recordCommand(userId, streamKey = null) {
    this.incrementQuest(userId, this.dateKey(), 'daily:chat', 'Use a Stream Monsters command', 1, 1, streamKey);
  }

  recordBattle(userId, streamKey = null) {
    this.incrementQuest(userId, this.weekKey(), 'weekly:battle', 'Fight a battle', 1, 1, streamKey);
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
    if (streamKey && quest.completedNow) this.store.incrementStreamMetric(streamKey, 'quest_completions');
    return quest;
  }

  prestige(userId) {
    const elements = new Set(this.store.getViewerMonsters(userId).map(monster => monster.element));
    if (elements.size < ELEMENTS.length) {
      return { success: false, error: 'STREAM_MONSTERS_PRESTIGE_REQUIRES_ALL_ELEMENTS' };
    }
    return { success: true, progress: this.store.resetForPrestige(userId) };
  }

  incrementQuest(userId, periodKey, questKey, title, target, increment = 1, streamKey = null) {
    const quest = this.store.upsertQuestProgress({ userId, periodKey, questKey, title, target, increment });
    if (streamKey && quest.completedNow) this.store.incrementStreamMetric(streamKey, 'quest_completions');
    return quest;
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
