'use strict';

class AutomationScheduler {
  constructor({ clock = () => Date.now(), createTask } = {}) {
    this.clock = clock; this.createTask = createTask; this.jobs = new Map(); this.timers = new Map();
  }

  register(job) {
    if (!job?.id || typeof job.run !== 'function') throw new TypeError('automation job requires id and run');
    this.jobs.set(job.id, { ...job, enabled: job.enabled !== false, lastRunAt: undefined });
    if (job.intervalMs) this.schedule(job.id, job.intervalMs);
    return this.jobs.get(job.id);
  }

  schedule(id, intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError('intervalMs must be positive');
    this.cancel(id);
    const timer = setInterval(() => this.trigger(id).catch(() => {}), intervalMs); timer.unref?.(); this.timers.set(id, timer);
  }

  async trigger(id, input) {
    const job = this.jobs.get(id); if (!job || !job.enabled) return undefined;
    job.lastRunAt = this.clock();
    const task = this.createTask?.({ automationId: id, input });
    const result = await job.run({ id, input, task });
    return { id, task, result, startedAt: job.lastRunAt, finishedAt: this.clock() };
  }

  cancel(id) { const timer = this.timers.get(id); if (timer) clearInterval(timer); this.timers.delete(id); }
  unregister(id) { this.cancel(id); return this.jobs.delete(id); }
  close() { for (const id of this.timers.keys()) this.cancel(id); }
}

module.exports = { AutomationScheduler };
