(function attachStreamMonstersRulesV8Pacing(root, factory) {
  const pacing = factory();
  if (typeof module === 'object' && module.exports) module.exports = pacing;
  if (root) root.StreamMonstersRulesV8Pacing = pacing;
}(typeof globalThis === 'object' ? globalThis : this, () => Object.freeze({
  ROSTER_MS: 6_000,
  SKILL_CHOICE_MS: 4_000,
  STAT_CHOICE_MS: 10_000,
  LOCK_FLASH_MS: 150,
  JOINT_REVEAL_MS: 300,
  ACTION_MS: 2_000,
  COLLAPSE_MS: 600,
  TERMINAL_ACTION_MS: 2_500,
  RESULT_BOARD_MS: 8_000,
  CANCELLATION_MS: 1_500,
  SERVICE_SWEEP_MS: 250
})));
