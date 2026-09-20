class DeadlineScheduler {
  constructor({ getDeadline, runDue, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, logger = null } = {}) {
    this.getDeadline = getDeadline;
    this.runDue = runDue;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.logger = logger;
    this.timer = null;
    this.running = false;
    this.started = false;
  }

  start() {
    if (this.started) return this;
    this.started = true;
    this.runAndRearm();
    return this;
  }

  stop() {
    this.started = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    return this;
  }

  runAndRearm() {
    if (!this.started || this.running) return;
    this.running = true;
    try {
      this.runDue?.();
    } catch (error) {
      this.logger?.(error);
    } finally {
      this.running = false;
      this.rearm();
    }
  }

  rearm() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    if (!this.started) return;
    const deadline = this.getDeadline?.(Number(this.now()));
    if (!Number.isFinite(Number(deadline))) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.runAndRearm();
    }, Math.max(0, Number(deadline) - Number(this.now())));
    this.timer?.unref?.();
  }

  deadlineChanged() {
    this.rearm();
  }
}


module.exports = DeadlineScheduler;
