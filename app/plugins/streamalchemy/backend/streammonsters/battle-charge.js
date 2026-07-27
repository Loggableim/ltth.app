const PASSIVE_CHARGE_PER_SECOND = 5;

function projectPassiveCharge({
  baseCharge,
  openedAtMs,
  deadlineMs,
  asOfMs,
  ratePerSecond = PASSIVE_CHARGE_PER_SECOND
}) {
  const opened = Number(openedAtMs) || 0;
  const deadline = Math.max(opened, Number(deadlineMs) || opened);
  const observed = Math.max(opened, Math.min(deadline, Number(asOfMs) || opened));
  const seconds = Math.floor((observed - opened) / 1_000);
  return Math.min(100, Math.max(0, Number(baseCharge) || 0) +
    (seconds * Math.max(0, Number(ratePerSecond) || 0)));
}

module.exports = { PASSIVE_CHARGE_PER_SECOND, projectPassiveCharge };
