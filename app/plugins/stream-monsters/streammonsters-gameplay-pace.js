(function attachStreamMonstersGameplayPace(root, factory) {
  const contract = factory();
  if (typeof module === 'object' && module.exports) module.exports = contract;
  if (root) root.StreamMonstersGameplayPace = contract;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  const GAMEPLAY_PACES = Object.freeze(['arcade', 'standard', 'accessible']);
  const PACE_WINDOWS = Object.freeze({
    arcade: Object.freeze({
      mono: Object.freeze({ inputMs: 6_000, statMs: 10_000 }),
      bilingual: Object.freeze({ inputMs: 8_000, statMs: 12_000 })
    }),
    standard: Object.freeze({
      mono: Object.freeze({ inputMs: 8_000, statMs: 12_000 }),
      bilingual: Object.freeze({ inputMs: 10_000, statMs: 15_000 })
    }),
    accessible: Object.freeze({
      mono: Object.freeze({ inputMs: 10_000, statMs: 15_000 }),
      bilingual: Object.freeze({ inputMs: 12_000, statMs: 18_000 })
    })
  });
  const PRESENTATION_TIMING = Object.freeze({
    standardActionMs: 1_600,
    specialActionMs: 2_400,
    terminalActionMs: 2_800,
    compactRepeatFrom: 3
  });

  function normalizeGameplayPace(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'arcade-rally') return 'arcade';
    return GAMEPLAY_PACES.includes(normalized) ? normalized : 'arcade';
  }

  function resolvePaceWindows(value, localeCount = 1) {
    const pace = normalizeGameplayPace(value);
    const languageMode = Number(localeCount) > 1 ? 'bilingual' : 'mono';
    const selected = PACE_WINDOWS[pace][languageMode];
    return Object.freeze({
      inputMs: selected.inputMs,
      rosterMs: selected.inputMs,
      skillMs: selected.inputMs,
      statMs: selected.statMs
    });
  }

  return Object.freeze({
    GAMEPLAY_PACES,
    PACE_WINDOWS,
    PRESENTATION_TIMING,
    normalizeGameplayPace,
    resolvePaceWindows
  });
}));
