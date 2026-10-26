'use strict';
class RateLimiter {
  constructor(options = {}) { this.maxConcurrent = options.maxConcurrent ?? 1; this.minIntervalMs = options.minIntervalMs ?? 500; this.running = 0; this.lastStartAt = 0; this.queue = []; }
  schedule(task) { return new Promise((resolve, reject) => { this.queue.push(async () => { this.running += 1; this.lastStartAt = Date.now(); try { resolve(await task()); } catch (error) { reject(error); } finally { this.running -= 1; this.drain(); } }); this.drain(); }); }
  drain() { while (this.running < this.maxConcurrent && this.queue.length) { const wait = this.minIntervalMs - (Date.now() - this.lastStartAt); if (wait > 0) { const timer = setTimeout(() => this.drain(), wait); timer.unref?.(); return; } this.queue.shift()(); } }
}
module.exports = Object.freeze({ RateLimiter });
