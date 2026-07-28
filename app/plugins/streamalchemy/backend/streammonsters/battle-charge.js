const PASSIVE_CHARGE_PER_SECOND = 5;

function projectPassiveCharge({
  baseCharge,
  openedAtMs,
  deadlineMs,
  asOfMs,
  active = true,
  pausedMs = 0,
  pauseStartedAtMs = null,
  pauseUntilMs = null,
  ratePerSecond = PASSIVE_CHARGE_PER_SECOND
}) {
  const normalizedBase = Math.min(100, Math.max(0, Number(baseCharge) || 0));
  if (!active) return normalizedBase;
  const opened = Number(openedAtMs) || 0;
  const deadline = Math.max(opened, Number(deadlineMs) || opened);
  const observed = Math.max(opened, Math.min(deadline, Number(asOfMs) || opened));
  const persistedPauseMs = Math.max(0, Number(pausedMs) || 0);
  const pauseStarted = pauseStartedAtMs == null ? NaN : Number(pauseStartedAtMs);
  const pauseUntil = pauseUntilMs != null && Number.isFinite(Number(pauseUntilMs))
    ? Number(pauseUntilMs)
    : observed;
  const currentPauseMs = Number.isFinite(pauseStarted)
    ? Math.max(0, Math.min(observed, pauseUntil) - Math.max(opened, pauseStarted))
    : 0;
  const seconds = Math.floor(Math.max(
    0,
    observed - opened - persistedPauseMs - currentPauseMs
  ) / 1_000);
  return Math.min(100, normalizedBase +
    (seconds * Math.max(0, Number(ratePerSecond) || 0)));
}

module.exports = { PASSIVE_CHARGE_PER_SECOND, projectPassiveCharge };
