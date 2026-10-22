'use strict';

const RETRY_DELAYS_MS = Object.freeze([0, 2000, 5000, 10000, 30000]);
const sleep = (ms) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); timer.unref?.(); });

class EdgeSyncNetworkRecovery {
  constructor(deps) { this.deps = deps; this.active = undefined; this.generation = 0; this.disposed = false; }
  recover(reason) { if (this.disposed || !this.deps.canRecover()) return Promise.resolve(); if (this.active) return this.active; const generation = ++this.generation; const task = this.run(reason, generation).finally(() => { if (this.active === task) this.active = undefined; }); this.active = task; return task; }
  dispose() { this.disposed = true; this.generation += 1; this.active = undefined; }
  async run(reason, generation) {
    const startedAt = Date.now(); this.deps.logger?.info?.(`[EdgeSync] CHANNEL-RECOVERY start reason=${reason}`);
    const network = await (this.deps.waitForNetwork || (() => Promise.resolve({ ready: true, waitedMs: 0 })))(); this.deps.logger?.info?.(`[EdgeSync] CHANNEL-RECOVERY network ready=${network.ready} waitedMs=${network.waitedMs}`);
    let lastError;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (!this.isCurrent(generation)) return; const delay = RETRY_DELAYS_MS[attempt]; if (delay) await (this.deps.sleep || sleep)(delay); if (!this.isCurrent(generation)) return;
      try { await this.deps.reconnect(); if (!this.deps.isConnected()) throw new Error('channel SDK handshake completed without an active SDK'); this.deps.logger?.info?.(`[EdgeSync] CHANNEL-RECOVERY success reason=${reason} attempt=${attempt + 1} elapsedMs=${Date.now() - startedAt}`); return; }
      catch (error) { lastError = error; this.deps.logger?.warn?.(`[EdgeSync] CHANNEL-RECOVERY attempt=${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'channel recovery failed'));
  }
  isCurrent(generation) { return !this.disposed && generation === this.generation && this.deps.canRecover(); }
}

module.exports = Object.freeze({ EdgeSyncNetworkRecovery, RETRY_DELAYS_MS, sleep });
