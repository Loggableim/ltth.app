/**
 * Slot Machine Game Logic
 *
 * Three-reel, server-authoritative slot engine.
 * Triggered via chat commands or gift events.
 * Supports configurable symbol sets, odds profiles per trigger context,
 * per-user cooldowns, and a reward dispatcher that can fire
 * OpenShock, audio, overlay effects, and XP grants.
 *
 * Architecture note:
 *   - SlotGame is instantiated by GameEnginePlugin (main.js) and receives
 *     the shared PluginAPI, GameEngineDatabase, and logger instances –
 *     exactly the same pattern used by WheelGame and PlinkoGame.
 *   - The UnifiedQueueManager is wired in after construction via setUnifiedQueue().
 *   - All RNG is performed server-side; the overlay only animates and displays.
 */

'use strict';

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const CLEANUP_INTERVAL_MS = 30_000;        // Clean up stale active-spin entries
const MAX_SPIN_AGE_MS = 60_000;            // A spin older than this is considered lost
const OPENSHOCK_BATCH_CLEANUP_THRESHOLD = 50;

const OPENSHOCK_MIN_INTENSITY = 1;
const OPENSHOCK_MAX_INTENSITY = 100;
const OPENSHOCK_MIN_DURATION_MS = 300;
const OPENSHOCK_MAX_DURATION_MS = 10_000;
const OPENSHOCK_DISPLAY_DELAY_MS = 500;    // Fire shock after result is visible

/** Default chat cooldown when none is configured in settings. */
const DEFAULT_CHAT_COOLDOWN_MS = 30_000;

/** Outcome categories ordered from worst to best. */
const OUTCOME_CATEGORIES = ['loss', 'near_miss', 'small_win', 'medium_win', 'big_win', 'jackpot'];

// ────────────────────────────────────────────────────────────
// SlotGame class
// ────────────────────────────────────────────────────────────

class SlotGame {
  constructor(api, db, logger) {
    this.api = api;
    this.db = db;
    this.logger = logger;
    this.io = api.getSocketIO();
    this.unifiedQueue = null; // Set by main.js via setUnifiedQueue()

    // In-flight spins: spinId -> { username, nickname, machineId, timestamp, status }
    this.activeSpins = new Map();

    // Pending rewards awaiting overlay spin-completed confirmation:
    // spinId -> { rewardActions, spinData, outcome }
    this.pendingRewards = new Map();

    // Cooldown tracking: username -> lastSpinTimestamp (ms)
    this.userCooldowns = new Map();

    // Global cooldown tracking: machineId -> lastSpinTimestamp (ms)
    this.globalCooldowns = new Map();

    // Spin ID counter
    this.spinIdCounter = 0;

    // OpenShock deduplication
    this.openshockBatches = new Map();
    this.openshockBatchWindow = 5_000;

    // Cleanup timer handle
    this.cleanupTimer = null;
  }

  // ────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────

  init() {
    this.logger.info('🎰 Slot Machine game initialized');
  }

  setUnifiedQueue(unifiedQueue) {
    this.unifiedQueue = unifiedQueue;
  }

  startCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this._cleanupStaleSpins(), CLEANUP_INTERVAL_MS);
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.activeSpins.clear();
    this.pendingRewards.clear();
    this.userCooldowns.clear();
    this.globalCooldowns.clear();
    this.openshockBatches.clear();
    this.logger.info('🎰 Slot Machine game destroyed');
  }

  // ────────────────────────────────────────────────────────
  // Public accessors
  // ────────────────────────────────────────────────────────

  getAllMachines() {
    return this.db.getAllSlotMachines();
  }

  getConfig(machineId = null) {
    return this.db.getSlotConfig(machineId);
  }

  createMachine(name, symbols = null, settings = null) {
    const defaultSymbols = symbols || this._defaultSymbols();
    const defaultSettings = settings || this._defaultSettings();
    const id = this.db.createSlotMachine(
      name,
      defaultSymbols,
      defaultSettings,
      {},
      this._defaultOddsProfiles(),
      this._defaultRewardRules()
    );
    this.logger.info(`🎰 Created new slot machine: "${name}" (ID: ${id})`);
    return id;
  }

  updateConfig(machineId, symbols, settings, giftMappings, oddsProfiles, rewardRules) {
    this.db.updateSlotConfig(machineId, symbols, settings, giftMappings, oddsProfiles, rewardRules);
    this.io.emit('slot:config-updated', {
      machineId,
      symbols,
      settings,
      giftMappings,
      oddsProfiles,
      rewardRules,
      timestamp: Date.now()
    });
    this.logger.info(`✅ Slot machine config updated (ID: ${machineId})`);
  }

  updateMachineName(machineId, name) {
    this.db.updateSlotName(machineId, name);
    this.logger.info(`✅ Slot machine name updated: "${name}" (ID: ${machineId})`);
  }

  updateMachineChatCommand(machineId, chatCommand) {
    this.db.updateSlotChatCommand(machineId, chatCommand);
    this.logger.info(`✅ Slot machine chat command updated: ${chatCommand || 'disabled'} (ID: ${machineId})`);
  }

  updateMachineEnabled(machineId, enabled) {
    this.db.updateSlotEnabled(machineId, enabled);
    this.logger.info(`✅ Slot machine ${enabled ? 'enabled' : 'disabled'} (ID: ${machineId})`);
  }

  deleteMachine(machineId) {
    const ok = this.db.deleteSlotMachine(machineId);
    if (ok) this.logger.info(`✅ Slot machine deleted (ID: ${machineId})`);
    return ok;
  }

  findMachineByGiftTrigger(giftIdentifier) {
    return this.db.findSlotMachineByGiftTrigger(giftIdentifier);
  }

  findMachineByChatCommand(command) {
    return this.db.findSlotMachineByChatCommand(command);
  }

  getStats(machineId) {
    return this.db.getSlotStats(machineId);
  }

  // ────────────────────────────────────────────────────────
  // Spin trigger entry points (called from main.js)
  // ────────────────────────────────────────────────────────

  /**
   * Trigger a slot spin from a chat command.
   * Validates cooldown, then enqueues via the shared unified queue (or starts
   * immediately if the queue is unavailable).
   *
   * @param {string} username
   * @param {string} nickname
   * @param {string} profilePictureUrl
   * @param {string} commandText – the full original command (e.g. "!spin")
   * @param {number|null} machineId – optional, defaults to first machine
   * @param {Object} [userRoles]  – { isModerator, isSubscriber, teamMemberLevel }
   * @returns {Object} { success, error?, spinId?, queued?, position? }
   */
  async triggerSpinFromChat(username, nickname, profilePictureUrl, commandText, machineId = null, userRoles = {}) {
    return this._enqueueOrStart(username, nickname, profilePictureUrl, 'chat', commandText, machineId, 'chat', userRoles);
  }

  /**
   * Trigger a slot spin from a gift event.
   *
   * @param {string} username
   * @param {string} nickname
   * @param {string} profilePictureUrl
   * @param {string} giftName
   * @param {string|null} oddsProfileOverride – optional profile name from gift mapping
   * @param {number|null} machineId
   * @returns {Object} { success, error?, spinId?, queued?, position? }
   */
  async triggerSpinFromGift(username, nickname, profilePictureUrl, giftName, oddsProfileOverride = null, machineId = null) {
    return this._enqueueOrStart(username, nickname, profilePictureUrl, 'gift', giftName, machineId, oddsProfileOverride || 'gift_common');
  }

  /**
   * @private
   * Validate cooldowns, build spinData, then route through the unified queue
   * (or start immediately as fallback when no queue is set).
   */
  async _enqueueOrStart(username, nickname, profilePictureUrl, triggerType, triggerValue, machineId, oddsProfileKey, userRoles = {}) {
    const safeUsername = String(username || 'unknown').slice(0, 100);
    const safeNickname = String(nickname || safeUsername).slice(0, 100);

    const config = this.db.getSlotConfig(machineId);
    if (!config) {
      return { success: false, error: 'No slot machine configured' };
    }
    if (!config.enabled) {
      return { success: false, error: 'Slot machine is disabled' };
    }

    const resolvedMachineId = config.id;
    const settings = config.settings || {};

    // ── Superfan access check (chat triggers only) ────────────
    if (triggerType === 'chat' && settings.requireSuperfan) {
      const { isSuperfan = false, isModerator = false, teamMemberLevel = 0 } = userRoles;
      if (!isSuperfan && !isModerator && teamMemberLevel === 0) {
        return { success: false, error: 'Superfan status required' };
      }
    }

    // ── Cooldown check (chat triggers only) ──────────────────
    if (triggerType === 'chat') {
      const cooldownResult = this._checkCooldown(safeUsername, resolvedMachineId, settings, userRoles);
      if (!cooldownResult.allowed) {
        this.io.emit('slot:cooldown', {
          username: safeUsername,
          nickname: safeNickname,
          remainingMs: cooldownResult.remainingMs,
          machineId: resolvedMachineId
        });
        return { success: false, error: `Cooldown: ${Math.ceil(cooldownResult.remainingMs / 1000)}s remaining` };
      }
      // Register cooldown immediately to prevent rapid fire
      this._registerCooldown(safeUsername, resolvedMachineId, settings, userRoles);
    }

    // ── Global cooldown check (all trigger types except test) ──
    if (triggerType !== 'test' && settings.globalCooldownMs > 0) {
      const lastGlobal = this.globalCooldowns.get(resolvedMachineId) || 0;
      const elapsed = Date.now() - lastGlobal;
      if (elapsed < settings.globalCooldownMs) {
        return { success: false, error: `Global cooldown active (${Math.ceil((settings.globalCooldownMs - elapsed) / 1000)}s)` };
      }
      this.globalCooldowns.set(resolvedMachineId, Date.now());
    }

    // ── Build spin data ───────────────────────────────────────
    const spinId = ++this.spinIdCounter;
    const spinData = {
      spinId,
      username: safeUsername,
      nickname: safeNickname,
      profilePictureUrl: profilePictureUrl || '',
      machineId: resolvedMachineId,
      triggerType,
      triggerValue,
      oddsProfileKey,
      settings,   // pass settings so queue can compute timeout
      timestamp: Date.now()
    };

    this.logger.info(`🎰 [SLOT] Spin #${spinId} enqueuing for ${safeNickname} (trigger: ${triggerType}, machine: ${resolvedMachineId})`);

    // ── Route through unified queue ───────────────────────────
    if (this.unifiedQueue) {
      const queueResult = this.unifiedQueue.queueSlot(spinData);
      if (!queueResult.queued) {
        return { success: false, error: queueResult.error || 'Queue full' };
      }
      return { success: true, spinId, queued: true, position: queueResult.position };
    }

    // ── Fallback: start directly if no queue ──────────────────
    const result = await this.startSpinFromQueue(spinData);
    return result;
  }

  // ────────────────────────────────────────────────────────
  // Core spin logic
  // ────────────────────────────────────────────────────────

  /**
   * @private
   * Direct spin execution for test/admin triggers.
   * Bypasses the unified queue and resolves immediately with outcome + rewards.
   * Rewards are dispatched after a delay matching the animation duration so
   * that OpenShock/XP fire only once the overlay animation is visually complete.
   *
   * @param {string} username
   * @param {string} nickname
   * @param {string} profilePictureUrl
   * @param {string} triggerType   – 'chat' | 'gift' | 'test'
   * @param {string} triggerValue  – raw command text or gift name
   * @param {number|null} machineId
   * @param {string} oddsProfileKey
   * @param {Object} [userRoles]   – { isModerator, isSubscriber, teamMemberLevel }
   */
  async _triggerSpin(username, nickname, profilePictureUrl, triggerType, triggerValue, machineId, oddsProfileKey, userRoles = {}) {
    // Sanitize inputs
    const safeUsername = String(username || 'unknown').slice(0, 100);
    const safeNickname = String(nickname || safeUsername).slice(0, 100);

    const config = this.db.getSlotConfig(machineId);
    if (!config) {
      return { success: false, error: 'No slot machine configured' };
    }
    if (!config.enabled) {
      return { success: false, error: 'Slot machine is disabled' };
    }

    const resolvedMachineId = config.id;
    const settings = config.settings || {};

    // ── Cooldown check (chat triggers only) ──────────────────
    if (triggerType === 'chat') {
      const cooldownResult = this._checkCooldown(safeUsername, resolvedMachineId, settings, userRoles);
      if (!cooldownResult.allowed) {
        this.io.emit('slot:cooldown', {
          username: safeUsername,
          nickname: safeNickname,
          remainingMs: cooldownResult.remainingMs,
          machineId: resolvedMachineId
        });
        return { success: false, error: `Cooldown: ${Math.ceil(cooldownResult.remainingMs / 1000)}s remaining` };
      }
      this._registerCooldown(safeUsername, resolvedMachineId, settings, userRoles);
    }

    // ── Global cooldown check (all trigger types except test) ──
    if (triggerType !== 'test' && settings.globalCooldownMs > 0) {
      const lastGlobal = this.globalCooldowns.get(resolvedMachineId) || 0;
      const elapsed = Date.now() - lastGlobal;
      if (elapsed < settings.globalCooldownMs) {
        return { success: false, error: `Global cooldown active (${Math.ceil((settings.globalCooldownMs - elapsed) / 1000)}s)` };
      }
      this.globalCooldowns.set(resolvedMachineId, Date.now());
    }

    // ── Assign spin ID and track ─────────────────────────────
    const spinId = ++this.spinIdCounter;
    const spinData = {
      spinId,
      username: safeUsername,
      nickname: safeNickname,
      profilePictureUrl: profilePictureUrl || '',
      machineId: resolvedMachineId,
      triggerType,
      triggerValue,
      timestamp: Date.now(),
      status: 'spinning'
    };
    this.activeSpins.set(spinId, spinData);

    // ── Resolve outcome (server-authoritative) ────────────────
    let outcome;
    let rewardActions;
    try {
      outcome = this._resolveOutcome(config, oddsProfileKey);
      rewardActions = this._buildRewardActions(outcome, config);
      this.db.recordSlotSpin({
        machineId: resolvedMachineId,
        username: safeUsername,
        nickname: safeNickname,
        triggerType,
        triggerValue,
        reel1: outcome.reels[0] ? outcome.reels[0].id : 'unknown',
        reel2: outcome.reels[1] ? outcome.reels[1].id : 'unknown',
        reel3: outcome.reels[2] ? outcome.reels[2].id : 'unknown',
        outcomeCategory: outcome.category,
        rewardActions
      });
    } catch (error) {
      this.logger.error(`[SLOT] Error resolving outcome for spin #${spinId}: ${error.message}`);
      this.activeSpins.delete(spinId);
      this.io.emit('slot:spin-error', { spinId, machineId: resolvedMachineId });
      return { success: false, error: error.message };
    }

    // ── Determine overlay mode ────────────────────────────────
    const overlayConfig = settings.overlayMode || {};
    const overlayMode = overlayConfig.defaultMode || 'large';

    // ── Notify overlay: spin started ─────────────────────────
    this.io.emit('slot:spin-started', {
      spinId,
      username: safeUsername,
      nickname: safeNickname,
      profilePictureUrl: profilePictureUrl || '',
      machineId: resolvedMachineId,
      machineName: config.name,
      symbols: config.symbols,
      settings,
      overlayMode,
      designSettings: settings.designSettings || {}
    });

    // ── Emit result to overlay ────────────────────────────────
    this.io.emit('slot:spin-result', {
      spinId,
      username: safeUsername,
      nickname: safeNickname,
      profilePictureUrl: profilePictureUrl || '',
      machineId: resolvedMachineId,
      machineName: config.name,
      reels: outcome.reels,
      category: outcome.category,
      isWin: outcome.isWin,
      isJackpot: outcome.category === 'jackpot',
      isNearMiss: outcome.category === 'near_miss',
      rewardActions,
      settings
    });

    // ── Dispatch rewards after animation completes ─────────────
    // Calculate total animation duration so rewards fire only after overlay is done.
    const spinDuration = settings.spinDuration || 3000;
    const reelStopDelay = settings.reelStopDelay || 400;
    const rewardDelay = spinDuration + (reelStopDelay * 2) + 800; // 800ms covers stop animation

    spinData.status = 'animating';
    const rewardTimer = setTimeout(async () => {
      try {
        await this._dispatchRewards(rewardActions, spinData, outcome, config);
        spinData.status = 'completed';
        this.logger.info(
          `🎰 [SLOT] Spin #${spinId} (direct) for ${safeNickname} → ${outcome.reels.map(s => s.emoji || s.label || '?').join(' ')} (${outcome.category})`
        );
      } catch (err) {
        this.logger.error(`[SLOT] Reward dispatch error for spin #${spinId}: ${err.message}`);
      } finally {
        const cleanupTimer = setTimeout(() => this.activeSpins.delete(spinId), MAX_SPIN_AGE_MS);
        if (typeof cleanupTimer.unref === 'function') {
          cleanupTimer.unref();
        }
      }
    }, rewardDelay);
    if (typeof rewardTimer.unref === 'function') {
      rewardTimer.unref();
    }

    return { success: true, spinId, category: outcome.category, isWin: outcome.isWin };
  }

  /**
   * Start a queued slot spin.
   * Called by UnifiedQueueManager.processSlotItem() when this spin reaches
   * the front of the shared queue.
   *
   * Spin lifecycle:
   *   startSpinFromQueue()   → emits slot:spin-started + slot:spin-result
   *   overlay animates       → emits slot:spin-completed back to server
   *   handleSpinCompleted()  → dispatches rewards → calls unifiedQueue.completeProcessing()
   *
   * @param {Object} spinData – from queueSlot()
   * @returns {{ success: boolean, spinId?: number, error?: string }}
   */
  async startSpinFromQueue(spinData) {
    const { spinId, username, nickname, profilePictureUrl, machineId, triggerType, triggerValue, oddsProfileKey } = spinData;

    this.logger.info(`🎰 [SLOT] Spin start #${spinId} for ${nickname} (trigger: ${triggerType})`);

    // ── Load fresh config ─────────────────────────────────────
    const config = this.db.getSlotConfig(machineId);
    if (!config) {
      this.logger.error(`[SLOT] No config for machine ${machineId} (spin #${spinId})`);
      return { success: false, error: 'No slot machine configured' };
    }
    if (!config.enabled) {
      this.logger.warn(`[SLOT] Machine ${machineId} is disabled (spin #${spinId})`);
      return { success: false, error: 'Slot machine is disabled' };
    }

    const settings = config.settings || {};

    // ── Track spin ────────────────────────────────────────────
    const trackData = {
      spinId,
      username,
      nickname,
      profilePictureUrl: profilePictureUrl || '',
      machineId,
      triggerType,
      triggerValue,
      timestamp: Date.now(),
      status: 'spinning'
    };
    this.activeSpins.set(spinId, trackData);

    // ── Resolve outcome (server-authoritative) ────────────────
    let outcome;
    let rewardActions;
    try {
      outcome = this._resolveOutcome(config, oddsProfileKey || 'chat');
      rewardActions = this._buildRewardActions(outcome, config);
      this.db.recordSlotSpin({
        machineId,
        username,
        nickname,
        triggerType,
        triggerValue,
        reel1: outcome.reels[0] ? outcome.reels[0].id : 'unknown',
        reel2: outcome.reels[1] ? outcome.reels[1].id : 'unknown',
        reel3: outcome.reels[2] ? outcome.reels[2].id : 'unknown',
        outcomeCategory: outcome.category,
        rewardActions
      });
    } catch (error) {
      this.logger.error(`[SLOT] Outcome resolution error for spin #${spinId}: ${error.message}`);
      this.activeSpins.delete(spinId);
      this.io.emit('slot:spin-error', { spinId, machineId });
      return { success: false, error: error.message };
    }

    // ── Store pending rewards (await overlay confirmation) ─────
    this.pendingRewards.set(spinId, { rewardActions, spinData: trackData, outcome, config });

    // ── Determine overlay mode based on trigger type ──────────
    const overlayConfig = settings.overlayMode || {};
    let overlayMode = overlayConfig.defaultMode || 'large';
    if (triggerType === 'chat' && overlayConfig.chatMode) overlayMode = overlayConfig.chatMode;
    if (triggerType === 'gift' && overlayConfig.giftMode) overlayMode = overlayConfig.giftMode;
    if (outcome.category === 'jackpot' && overlayConfig.jackpotMode) overlayMode = overlayConfig.jackpotMode;

    // ── Emit spin-started (overlay begins animation) ──────────
    this.io.emit('slot:spin-started', {
      spinId,
      username,
      nickname,
      profilePictureUrl: profilePictureUrl || '',
      machineId,
      machineName: config.name,
      symbols: config.symbols,
      settings,
      overlayMode,
      designSettings: settings.designSettings || {}
    });

    this.logger.debug(`🎰 [SLOT] spin-started emitted (spinId: ${spinId}, overlayMode: ${overlayMode})`);

    // ── Emit spin-result (overlay stops reels + shows outcome) ─
    this.io.emit('slot:spin-result', {
      spinId,
      username,
      nickname,
      profilePictureUrl: profilePictureUrl || '',
      machineId,
      machineName: config.name,
      reels: outcome.reels,
      category: outcome.category,
      isWin: outcome.isWin,
      isJackpot: outcome.category === 'jackpot',
      isNearMiss: outcome.category === 'near_miss',
      rewardActions,
      settings
    });

    this.logger.debug(`🎰 [SLOT] spin-result emitted (spinId: ${spinId}, category: ${outcome.category})`);

    // Rewards are dispatched only in handleSpinCompleted() after the overlay
    // emits slot:spin-completed, or in forceCompleteSpin() on timeout.
    return { success: true, spinId, category: outcome.category, isWin: outcome.isWin };
  }

  /**
   * Handle overlay confirmation that the spin animation has finished.
   * Dispatches rewards and releases the unified queue.
   *
   * @param {number} spinId
   */
  async handleSpinCompleted(spinId) {
    const pending = this.pendingRewards.get(spinId);
    if (!pending) {
      // Already handled (e.g. by forceCompleteSpin) or unknown spinId
      this.logger.debug(`[SLOT] handleSpinCompleted called for unknown/already-completed spinId ${spinId}`);
      return;
    }

    this.pendingRewards.delete(spinId);
    const { rewardActions, spinData, outcome, config } = pending;

    this.logger.info(
      `🎰 [SLOT] Spin #${spinId} completed for ${spinData.nickname} → ${outcome.reels.map(s => s.emoji || s.label || '?').join(' ')} (${outcome.category})`
    );

    spinData.status = 'completed';

    try {
      await this._dispatchRewards(rewardActions, spinData, outcome, config);
    } catch (err) {
      this.logger.error(`[SLOT] Reward dispatch error for spin #${spinId}: ${err.message}`);
    } finally {
      const cleanupTimer = setTimeout(() => this.activeSpins.delete(spinId), MAX_SPIN_AGE_MS);
      if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
      }
    }

    // Release the unified queue so the next item can be processed
    if (this.unifiedQueue) {
      this.logger.debug(`🎰 [SLOT] Releasing unified queue after spin #${spinId}`);
      this.unifiedQueue.completeProcessing();
    }
  }

  /**
   * Force-complete a pending spin (called on queue timeout).
   * Dispatches rewards anyway so nothing is silently lost.
   *
   * @param {number} spinId
   */
  async forceCompleteSpin(spinId) {
    const pending = this.pendingRewards.get(spinId);
    if (!pending) {
      return; // Already completed
    }

    this.pendingRewards.delete(spinId);
    const { rewardActions, spinData, outcome, config } = pending;

    this.logger.warn(`⚠️ [SLOT] Force-completing spin #${spinId} for ${spinData.username} (overlay timeout)`);
    spinData.status = 'force-completed';

    try {
      await this._dispatchRewards(rewardActions, spinData, outcome, config);
    } catch (err) {
      this.logger.error(`[SLOT] Reward dispatch error (force) for spin #${spinId}: ${err.message}`);
    } finally {
      this.activeSpins.delete(spinId);
    }
    // Note: unifiedQueue.completeProcessing() is called by forceCompleteProcessing
    // in the queue manager, so we do NOT call it again here.
  }

  // ────────────────────────────────────────────────────────
  // Cooldown helpers
  // ────────────────────────────────────────────────────────

  /**
   * @private
   * Resolve the effective cooldown duration for a user based on their role.
   * Priority: moderator/team-member/superfan > subscriber > default.
   *
   * @param {Object} settings   – machine settings
   * @param {Object} userRoles  – { isModerator, isSubscriber, teamMemberLevel, isSuperfan }
   * @returns {number} cooldown in milliseconds
   */
  _effectiveCooldownMs(settings, userRoles = {}) {
    const { isModerator = false, isSubscriber = false, teamMemberLevel = 0, isSuperfan = false } = userRoles;
    const defaultCd = settings.chatCooldownMs || DEFAULT_CHAT_COOLDOWN_MS;
    if (isModerator || teamMemberLevel > 0 || isSuperfan) {
      // Moderators, team members, and superfans get the VIP cooldown
      return settings.vipCooldownMs != null ? settings.vipCooldownMs : defaultCd;
    }
    if (isSubscriber) {
      return settings.subCooldownMs != null ? settings.subCooldownMs : defaultCd;
    }
    return defaultCd;
  }

  /**
   * @private
   * Check if a user is allowed to spin right now.
   *
   * @param {string} username
   * @param {number} machineId
   * @param {Object} settings
   * @param {Object} [userRoles]
   * @returns {{ allowed: boolean, remainingMs: number }}
   */
  _checkCooldown(username, machineId, settings, userRoles = {}) {
    const now = Date.now();
    const key = `${machineId}:${username}`;
    const last = this.userCooldowns.get(key) || 0;
    const elapsed = now - last;
    const cdMs = this._effectiveCooldownMs(settings, userRoles);

    if (elapsed < cdMs) {
      return { allowed: false, remainingMs: cdMs - elapsed };
    }
    return { allowed: true, remainingMs: 0 };
  }

  /**
   * @private
   * Register the cooldown timestamp for a user after a successful spin.
   */
  _registerCooldown(username, machineId, settings, userRoles = {}) {
    const key = `${machineId}:${username}`;
    this.userCooldowns.set(key, Date.now());
  }

  /**
   * Get remaining cooldown for a user (in ms, 0 if none)
   * @param {string} username
   * @param {number} machineId
   * @returns {number}
   */
  getUserCooldownRemaining(username, machineId) {
    const config = this.db.getSlotConfig(machineId);
    if (!config) return 0;
    const settings = config.settings || {};
    const check = this._checkCooldown(username, machineId, settings);
    return check.allowed ? 0 : check.remainingMs;
  }

  // ────────────────────────────────────────────────────────
  // Slot engine / RNG
  // ────────────────────────────────────────────────────────

  /**
   * @private
   * Resolve the outcome of a spin server-side.
   *
   * Flow:
   *   1. Build the effective odds profile (applying nearMissEnabled flag).
   *   2. Choose an outcome category via weighted random.
   *   3. Build three reels consistent with that category.
   *   4. Return the full outcome descriptor.
   *
   * @param {Object} config       – slot machine config (includes settings, symbols, oddsProfiles)
   * @param {string} profileKey   – key inside config.oddsProfiles (e.g. 'chat')
   * @returns {{ category: string, reels: Array, isWin: boolean }}
   */
  _resolveOutcome(config, profileKey) {
    const symbols = config.symbols;
    if (!symbols || symbols.length === 0) {
      throw new Error('No symbols configured for slot machine');
    }

    const settings = config.settings || {};

    // Determine odds profile to use
    const profiles = config.oddsProfiles || {};
    const rawProfile = profiles[profileKey] || profiles['chat'] || this._defaultOddsProfiles().chat;

    // Apply nearMissEnabled: if disabled, redistribute near_miss weight into loss
    let effectiveProfile;
    if (settings.nearMissEnabled === false && rawProfile.near_miss > 0) {
      effectiveProfile = Object.assign({}, rawProfile);
      effectiveProfile.loss = (effectiveProfile.loss || 0) + effectiveProfile.near_miss;
      delete effectiveProfile.near_miss;
    } else {
      effectiveProfile = rawProfile;
    }

    // Guard: if all weights are zero the choice would be undefined
    const totalWeight = Object.values(effectiveProfile).reduce((s, w) => s + (w || 0), 0);
    if (totalWeight === 0) {
      this.logger.warn('[SLOT] All odds-profile weights are zero – defaulting to loss');
      const reels = this._buildReels(symbols, 'loss', config);
      return { category: 'loss', reels, isWin: false };
    }

    // Choose outcome category via weighted random
    const category = this._weightedChoice(effectiveProfile);

    // Build reels consistent with the chosen category
    const reels = this._buildReels(symbols, category, config);

    const isWin = category !== 'loss' && category !== 'near_miss';

    return { category, reels, isWin };
  }

  /**
   * @private
   * Weighted random selection from an object of { key: positiveWeight }.
   * Handles zero-weight entries and float imprecision gracefully.
   */
  _weightedChoice(weightMap) {
    // Filter to positive weights only
    const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
    if (entries.length === 0) return 'loss';

    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let rand = Math.random() * total;
    for (const [key, weight] of entries) {
      rand -= weight;
      if (rand <= 0) return key;
    }
    // Fallback for float precision edge case
    return entries[entries.length - 1][0];
  }

  /**
   * @private
   * Pick a random symbol from the symbol list using per-symbol weights.
   */
  _randomSymbol(symbols) {
    const total = symbols.reduce((s, sym) => s + (sym.weight || 1), 0);
    let rand = Math.random() * total;
    for (const sym of symbols) {
      rand -= sym.weight || 1;
      if (rand <= 0) return sym;
    }
    return symbols[symbols.length - 1];
  }

  /**
   * @private
   * Build three reel symbols that satisfy the requested outcome category.
   *
   * Category semantics:
   *   loss       – all three reels differ and no pair  (degrades gracefully when <3 symbols)
   *   near_miss  – exactly two reels match (partial win)
   *   small_win  – three-of-a-kind with a low-tier symbol
   *   medium_win – three-of-a-kind with a mid-tier symbol
   *   big_win    – three-of-a-kind with a high-tier symbol
   *   jackpot    – three-of-a-kind with the rarest symbol
   *
   * Symbol tiers are derived from their position in the symbol array
   * (earlier = more common, later = rarer).
   */
  _buildReels(symbols, category, config) {
    const n = symbols.length;

    // Defensive: if only one symbol exists, forced 3-of-a-kind regardless of category
    if (n === 1) {
      return [symbols[0], symbols[0], symbols[0]];
    }

    switch (category) {
      case 'loss': {
        // Pick three symbols with no two matching (best effort – if <3 distinct symbols, allow repeats)
        let r1 = this._randomSymbol(symbols);
        let r2, r3;
        let attempts = 0;
        do {
          r2 = this._randomSymbol(symbols);
          attempts++;
        } while (r2.id === r1.id && attempts < 20);

        attempts = 0;
        do {
          r3 = this._randomSymbol(symbols);
          attempts++;
        } while ((r3.id === r1.id || r3.id === r2.id) && attempts < 20);

        return [r1, r2, r3];
      }

      case 'near_miss': {
        // Exactly two reels match; the odd-one-out is a different symbol
        const match = this._randomSymbol(symbols);
        let other;
        let attempts = 0;
        do {
          other = this._randomSymbol(symbols);
          attempts++;
        } while (other.id === match.id && attempts < 20);
        // If we couldn't find a different symbol in 20 tries, do a linear scan.
        // This correctly handles 2-symbol sets where weight is heavily skewed.
        if (other.id === match.id) {
          other = symbols.find(s => s.id !== match.id) || match;
        }

        // Randomize which reel is the odd one out
        const pos = Math.floor(Math.random() * 3);
        const reels = [match, match, match];
        reels[pos] = other;
        return reels;
      }

      case 'small_win': {
        // 3-of-a-kind from the lower ~45% of the symbol list (most common symbols)
        const pool = symbols.slice(0, Math.max(1, Math.ceil(n * 0.45)));
        const sym = pool[Math.floor(Math.random() * pool.length)];
        return [sym, sym, sym];
      }

      case 'medium_win': {
        // 3-of-a-kind from the middle ~35–70% range
        const start = Math.floor(n * 0.35);
        const end = Math.max(start + 1, Math.floor(n * 0.70));
        const pool = symbols.slice(start, end);
        const sym = pool[Math.floor(Math.random() * pool.length)];
        return [sym, sym, sym];
      }

      case 'big_win': {
        // 3-of-a-kind from the upper ~35% (excluding the jackpot symbol)
        const start = Math.floor(n * 0.65);
        // Exclude the very last symbol (reserved for jackpot) unless it's the only option
        const end = n > 1 ? n - 1 : n;
        const pool = symbols.slice(start, Math.max(start + 1, end));
        const sym = pool[Math.floor(Math.random() * pool.length)];
        return [sym, sym, sym];
      }

      case 'jackpot': {
        // 3-of-a-kind with the last (rarest) symbol
        const sym = symbols[n - 1];
        return [sym, sym, sym];
      }

      default:
        // Unknown category: three independent random symbols
        return [this._randomSymbol(symbols), this._randomSymbol(symbols), this._randomSymbol(symbols)];
    }
  }

  // ────────────────────────────────────────────────────────
  // Reward dispatch
  // ────────────────────────────────────────────────────────

  /**
   * @private
   * Build the list of reward actions to execute for this outcome.
   *
   * Two sources of actions:
   *   1. Category-based reward rules (audio, overlay, xp, chat, free_spin, openshock).
   *   2. Per-symbol OpenShock config: when 3x identical symbols appear (any win category),
   *      the winning symbol's isShock/shockIntensity/shockDuration/shockType/shockDevices
   *      fields are used – matching the wheel segment pattern.
   */
  _buildRewardActions(outcome, config) {
    const rules = config.rewardRules || [];
    const actions = [];

    // 1. Category-based rules
    for (const rule of rules) {
      if (!rule.outcomeCategories || !rule.outcomeCategories.includes(outcome.category)) continue;
      actions.push({ action: rule.action, params: rule.params || {} });
    }

    // 2. Per-symbol OpenShock: triggered when 3x identical symbols appear (isWin)
    if (outcome.isWin && Array.isArray(outcome.reels) && outcome.reels.length === 3) {
      const winSym = outcome.reels[0]; // All 3 match on a win
      if (winSym && winSym.isShock) {
        actions.push({
          action: 'openshock',
          params: {
            intensity:    winSym.shockIntensity    || 50,
            duration:     winSym.shockDuration     || 1000,
            shockType:    winSym.shockType         || 'shock',
            shockDevices: Array.isArray(winSym.shockDevices) ? winSym.shockDevices : []
          }
        });
      }
    }

    return actions;
  }

  /**
   * @private
   * Execute all reward actions for a spin.
   */
  async _dispatchRewards(rewardActions, spinData, outcome, config) {
    for (const reward of rewardActions) {
      try {
        await this._executeReward(reward, spinData, outcome, config);
      } catch (error) {
        this.logger.error(`[SLOT] Reward dispatch error (action: ${reward.action}): ${error.message}`);
      }
    }
  }

  /**
   * @private
   * Execute a single reward action.
   *
   * Supported action types:
   *   audio      – emit slot:play-audio socket event (overlay handles playback)
   *   overlay    – emit slot:overlay-effect socket event
   *   openshock  – trigger OpenShock haptic feedback
   *   xp         – grant XP via viewer-leaderboard plugin
   *   chat       – send a chat-message socket event (chatbot picks it up)
   *   free_spin  – grant a free spin (emit event, no cooldown deducted)
   */
  async _executeReward(reward, spinData, outcome, config) {
    const { action, params } = reward;

    switch (action) {
      case 'audio':
        this.io.emit('slot:play-audio', {
          machineId: spinData.machineId,
          audioType: params.audioType || 'win',
          username: spinData.username,
          category: outcome.category
        });
        break;

      case 'overlay':
        this.io.emit('slot:overlay-effect', {
          machineId: spinData.machineId,
          effect: params.effect || 'win',
          username: spinData.username,
          nickname: spinData.nickname,
          category: outcome.category,
          reels: outcome.reels
        });
        break;

      case 'openshock':
        await this._triggerOpenshock(params, spinData, outcome, config);
        break;

      case 'xp': {
        const xpAmount = params.xp || 0;
        if (xpAmount <= 0) break;
        try {
          const vlPlugin = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
          if (vlPlugin?.instance?.db) {
            vlPlugin.instance.db.addXP(
              spinData.username,
              xpAmount,
              'slot_win',
              { category: outcome.category, machineId: spinData.machineId }
            );
            this.logger.info(`🎰 Awarded ${xpAmount} XP to ${spinData.nickname} (slot ${outcome.category})`);
          }
        } catch (error) {
          this.logger.warn(`[SLOT] XP reward failed: ${error.message}`);
        }
        break;
      }

      case 'chat':
        this.io.emit('slot:chat-message', {
          machineId: spinData.machineId,
          username: spinData.username,
          nickname: spinData.nickname,
          message: (params.message || '')
            .replace('{username}', spinData.nickname)
            .replace('{category}', outcome.category)
            .replace('{reels}', outcome.reels.map(s => s.emoji).join(' ')),
          category: outcome.category
        });
        break;

      case 'free_spin':
        this.io.emit('slot:free-spin-granted', {
          machineId: spinData.machineId,
          username: spinData.username,
          nickname: spinData.nickname,
          count: params.count || 1
        });
        break;

      default:
        this.logger.warn(`[SLOT] Unknown reward action: ${action}`);
    }
  }

  // ────────────────────────────────────────────────────────
  // OpenShock integration
  // ────────────────────────────────────────────────────────

  /**
   * @private
   * Trigger OpenShock haptic feedback with deduplication and safety clamping.
   */
  async _triggerOpenshock(params, spinData, outcome, config) {
    const intensity = Math.max(OPENSHOCK_MIN_INTENSITY, Math.min(OPENSHOCK_MAX_INTENSITY, params.intensity || 50));
    const duration  = Math.max(OPENSHOCK_MIN_DURATION_MS, Math.min(OPENSHOCK_MAX_DURATION_MS, params.duration || 1000));
    const actionType = (params.shockType || 'shock').toLowerCase();

    const openShockPlugin = this.api.pluginLoader?.loadedPlugins?.get('openshock');
    if (!openShockPlugin?.instance) {
      this.logger.warn('[SLOT] OpenShock plugin not available');
      return;
    }

    const availableDevices = openShockPlugin.instance.devices || [];
    if (availableDevices.length === 0) {
      this.logger.warn('[SLOT] No OpenShock devices available');
      return;
    }

    // Determine target devices
    let targetDevices = [];
    if (params.shockDevices && params.shockDevices.length > 0) {
      targetDevices = params.shockDevices
        .map(id => availableDevices.find(d => d.id === id))
        .filter(Boolean);
    }
    if (targetDevices.length === 0) {
      targetDevices = [availableDevices[0]];
    }

    // Deduplication
    const batchKey = this._getOpenshockBatchKey(spinData.username, targetDevices.map(d => d.id), actionType, intensity, duration);
    if (this._isDuplicateOpenshockBatch(batchKey)) {
      this.logger.info(`[SLOT] Duplicate OpenShock batch blocked for ${spinData.username}`);
      return;
    }

    // Fire after display delay
    const logger = this.logger;
    const shockTimer = setTimeout(() => {
      (async () => {
        try {
          const plugin = this.api.pluginLoader?.loadedPlugins?.get('openshock');
          if (!plugin?.instance) return;

          for (const device of targetDevices) {
            try {
              const metadata = {
                priority: 2,
                source: 'slot',
                metadata: {
                  username: spinData.username,
                  nickname: spinData.nickname,
                  category: outcome.category,
                  machineId: spinData.machineId,
                  spinId: spinData.spinId
                }
              };
              if (actionType === 'vibrate') {
                await plugin.instance.openShockClient.sendVibrate(device.id, intensity, duration, metadata);
              } else {
                await plugin.instance.openShockClient.sendShock(device.id, intensity, duration, metadata);
              }
            } catch (err) {
              logger.error(`[SLOT] OpenShock command failed for device ${device.name}: ${err.message}`);
            }
          }

          this.io.emit('slot:shock-triggered', {
            spinId: spinData.spinId,
            username: spinData.username,
            nickname: spinData.nickname,
            actionType,
            intensity,
            duration,
            machineId: spinData.machineId,
            deviceCount: targetDevices.length
          });
        } catch (err) {
          logger.error(`[SLOT] OpenShock dispatch error: ${err.message}`);
        }
      })();
    }, OPENSHOCK_DISPLAY_DELAY_MS);
    if (typeof shockTimer.unref === 'function') {
      shockTimer.unref();
    }
  }

  /** @private */
  _getOpenshockBatchKey(username, deviceIds, type, intensity, duration) {
    return `${username}:${deviceIds.sort().join(',')}:${type}:${intensity}:${duration}`;
  }

  /** @private */
  _isDuplicateOpenshockBatch(key) {
    const now = Date.now();
    this._cleanupOpenshockBatches();
    const last = this.openshockBatches.get(key);
    if (last && (now - last) < this.openshockBatchWindow) return true;
    this.openshockBatches.set(key, now);
    return false;
  }

  /** @private */
  _cleanupOpenshockBatches() {
    if (this.openshockBatches.size < OPENSHOCK_BATCH_CLEANUP_THRESHOLD) return;
    const now = Date.now();
    for (const [key, ts] of this.openshockBatches.entries()) {
      if ((now - ts) > this.openshockBatchWindow) {
        this.openshockBatches.delete(key);
      }
    }
  }

  // ────────────────────────────────────────────────────────
  // Stale spin cleanup
  // ────────────────────────────────────────────────────────

  /** @private */
  _cleanupStaleSpins() {
    const now = Date.now();
    for (const [spinId, spinData] of this.activeSpins.entries()) {
      if ((now - spinData.timestamp) > MAX_SPIN_AGE_MS) {
        this.logger.warn(`[SLOT] Cleaning up stale spin #${spinId} for ${spinData.username}`);
        this.activeSpins.delete(spinId);
      }
    }

    // Also purge very old cooldown entries to prevent memory growth
    if (this.userCooldowns.size > 1000) {
      const cutoff = now - 3_600_000; // 1 hour
      for (const [key, ts] of this.userCooldowns.entries()) {
        if (ts < cutoff) this.userCooldowns.delete(key);
      }
    }
  }

  // ────────────────────────────────────────────────────────
  // Default configuration values
  // ────────────────────────────────────────────────────────

  /** @private */
  _defaultSymbols() {
    return [
      { id: 'cherry',  emoji: '🍒', label: 'Cherry',  weight: 18, isShock: false, shockIntensity: 20, shockDuration: 500,  shockType: 'vibrate', shockDevices: [] },
      { id: 'lemon',   emoji: '🍋', label: 'Lemon',   weight: 16, isShock: false, shockIntensity: 20, shockDuration: 500,  shockType: 'vibrate', shockDevices: [] },
      { id: 'grape',   emoji: '🍇', label: 'Grape',   weight: 14, isShock: false, shockIntensity: 25, shockDuration: 750,  shockType: 'vibrate', shockDevices: [] },
      { id: 'clover',  emoji: '🍀', label: 'Clover',  weight: 12, isShock: false, shockIntensity: 25, shockDuration: 750,  shockType: 'vibrate', shockDevices: [] },
      { id: 'star',    emoji: '⭐',  label: 'Star',    weight: 10, isShock: false, shockIntensity: 30, shockDuration: 1000, shockType: 'vibrate', shockDevices: [] },
      { id: 'bell',    emoji: '🔔', label: 'Bell',    weight:  8, isShock: false, shockIntensity: 30, shockDuration: 1000, shockType: 'vibrate', shockDevices: [] },
      { id: 'diamond', emoji: '💎', label: 'Diamond', weight:  6, isShock: false, shockIntensity: 40, shockDuration: 1500, shockType: 'shock',   shockDevices: [] },
      { id: 'money',   emoji: '💰', label: 'Money',   weight:  5, isShock: false, shockIntensity: 40, shockDuration: 1500, shockType: 'shock',   shockDevices: [] },
      { id: 'seven',   emoji: '7️⃣',  label: 'Seven',  weight:  4, isShock: false, shockIntensity: 50, shockDuration: 2000, shockType: 'shock',   shockDevices: [] },
      { id: 'bolt',    emoji: '⚡',  label: 'Bolt',   weight:  4, isShock: false, shockIntensity: 60, shockDuration: 2000, shockType: 'shock',   shockDevices: [] },
      { id: 'fire',    emoji: '🔥', label: 'Fire',   weight:  2, isShock: false, shockIntensity: 70, shockDuration: 2500, shockType: 'shock',   shockDevices: [] },
      { id: 'joker',   emoji: '🃏', label: 'Joker',  weight:  1, isShock: false, shockIntensity: 80, shockDuration: 3000, shockType: 'shock',   shockDevices: [] }
    ];
  }

  /**
   * Get available gift icons from the TikTok gift catalog for use as slot symbols.
   * Queries the gift_catalog table (populated by the TikTok connector) or falls back
   * to the game-engine's own gift_mappings for known gift names.
   *
   * @returns {Array<{ id: string, label: string, imageUrl: string, giftId?: number }>}
   */
  getGiftCatalogSymbols() {
    try {
      const mainDb = this.api.getDatabase();
      // Try the main gift_catalog table first (populated by TikTok connector)
      try {
        const rows = mainDb.db.prepare(
          'SELECT id, name, image_url FROM gift_catalog ORDER BY name'
        ).all();
        if (rows && rows.length > 0) {
          return rows.map(r => ({
            id: `gift_${r.id}`,
            label: r.name,
            imageUrl: r.image_url || '',
            giftId: r.id
          }));
        }
      } catch (innerErr) {
        this.logger.debug(`gift_catalog table not available: ${innerErr.message}`);
      }

      // Fall back to distinct gift names from slot gift mappings
      try {
        const rows = this.db.db.prepare(
          'SELECT DISTINCT gift_name FROM game_slot_gift_mappings WHERE gift_name IS NOT NULL ORDER BY gift_name'
        ).all();
        if (rows && rows.length > 0) {
          return rows.map(r => ({
            id: `gift_name_${r.gift_name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
            label: r.gift_name,
            imageUrl: ''
          }));
        }
      } catch (innerErr) {
        this.logger.debug(`game_slot_gift_mappings fallback failed: ${innerErr.message}`);
      }
    } catch (err) {
      this.logger.warn(`getGiftCatalogSymbols error: ${err.message}`);
    }
    return [];
  }

  /** @private */
  _defaultSettings() {
    return {
      spinDuration: 3000,
      reelStopDelay: 400,
      soundEnabled: true,
      soundVolume: 0.7,
      syncSpinToSound: false,
      chatCooldownMs: 30000,
      globalCooldownMs: 0,
      vipCooldownMs: 15000,
      subCooldownMs: 10000,
      requireSuperfan: false,
      nearMissEnabled: true,
      showResultDuration: 5000,
      overlayMode: {
        // Valid modes: 'large', 'horizontal', 'vertical', 'compact-hud',
        // 'compact-featured', 'icons-only' (bare reels, no title/player/result)
        defaultMode: 'large',
        chatMode: '',
        giftMode: '',
        jackpotMode: 'large',
        iconPreset: 'normal'
      },
      designSettings: {
        // theme: 'default' | 'neon' | 'retro' | 'minimal' | 'dark-pro'
        theme: 'default',
        bgColor: '#1a0a2e',
        borderColor: '#FFD700',
        reelBgColor: '#0d0620',
        textColor: '#ffffff',
        winColor: '#FFD700',
        titleText: '🎰 SLOT MACHINE',
        labelLoss: '😔 Kein Gewinn',
        labelNearMiss: '😬 Fast!',
        labelSmallWin: '🎉 Kleiner Gewinn!',
        labelMediumWin: '🎊 Gewinn!',
        labelBigWin: '🔥 Großer Gewinn!',
        labelJackpot: '🏆 JACKPOT!'
      }
    };
  }

  /** @private */
  _defaultOddsProfiles() {
    return {
      chat: {
        loss:       650,
        near_miss:   80,
        small_win:  150,
        medium_win:  70,
        big_win:     40,
        jackpot:     10
      },
      gift_common: {
        loss:       550,
        near_miss:   80,
        small_win:  200,
        medium_win:  90,
        big_win:     60,
        jackpot:     20
      },
      gift_rare: {
        loss:       400,
        near_miss:   70,
        small_win:  230,
        medium_win: 130,
        big_win:    110,
        jackpot:     60
      }
    };
  }

  /** @private */
  _defaultRewardRules() {
    return [
      {
        id: 'small_win_audio',
        outcomeCategories: ['small_win'],
        action: 'audio',
        params: { audioType: 'small_win' }
      },
      {
        id: 'medium_win_audio',
        outcomeCategories: ['medium_win'],
        action: 'audio',
        params: { audioType: 'medium_win' }
      },
      {
        id: 'big_win_audio',
        outcomeCategories: ['big_win'],
        action: 'audio',
        params: { audioType: 'big_win' }
      },
      {
        id: 'jackpot_audio',
        outcomeCategories: ['jackpot'],
        action: 'audio',
        params: { audioType: 'jackpot' }
      }
    ];
  }
}

module.exports = SlotGame;
