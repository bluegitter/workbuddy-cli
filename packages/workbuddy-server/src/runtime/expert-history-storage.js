'use strict';

const fs = require('fs');
const path = require('path');

class ExpertHistoryStorage {
  static createEmptyData() { return { version: 1, sessions: {}, lastUpdated: Date.now() }; }
  constructor(storagePath, options = {}) {
    this.storagePath = storagePath;
    this.writeDebounceMs = options.writeDebounceMs ?? 500;
    this.writeTimer = null; this.pendingData = null; this.isWriting = false;
    this.initSync(path.dirname(storagePath));
  }
  initSync(storageDir) { try { fs.mkdirSync(storageDir, { recursive: true }); if (!fs.existsSync(this.storagePath)) fs.writeFileSync(this.storagePath, JSON.stringify(ExpertHistoryStorage.createEmptyData(), null, 2)); } catch {} }
  configure(options = {}) { if (options.writeDebounceMs !== undefined && options.writeDebounceMs >= 0) this.writeDebounceMs = options.writeDebounceMs; }
  async load() { try { if (!await this.exists(this.storagePath)) return null; const data = JSON.parse(await fs.promises.readFile(this.storagePath, 'utf8')); return this.isValidData(data) ? data : null; } catch { return null; } }
  saveAsync(data) { this.pendingData = data; if (this.writeTimer) clearTimeout(this.writeTimer); this.writeTimer = setTimeout(() => this.flushPendingWrite(), this.writeDebounceMs); this.writeTimer.unref?.(); }
  async flush() { if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; } if (this.pendingData) { const data = this.pendingData; this.pendingData = null; await this.doWrite(data); } }
  async clear() { try { if (await this.exists(this.storagePath)) await fs.promises.unlink(this.storagePath); } catch {} }
  getStoragePath() { return this.storagePath; }
  async flushPendingWrite() { this.writeTimer = null; if (!this.pendingData) return; const data = this.pendingData; this.pendingData = null; await this.doWrite(data); }
  async doWrite(data) {
    if (this.isWriting) { this.pendingData = data; return; }
    this.isWriting = true;
    try { await fs.promises.mkdir(path.dirname(this.storagePath), { recursive: true }); const tempPath = `${this.storagePath}.tmp`; await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8'); await fs.promises.rename(tempPath, this.storagePath); }
    catch {} finally { this.isWriting = false; if (this.pendingData) { const next = this.pendingData; this.pendingData = null; setImmediate(() => this.doWrite(next)); } }
  }
  async exists(filePath) { try { await fs.promises.access(filePath, fs.constants.F_OK); return true; } catch { return false; } }
  hasHistory(data) { return Object.values(data.sessions || {}).some((experts) => Array.isArray(experts) && experts.length > 0); }
  isValidData(data) { return !!data && typeof data === 'object' && typeof data.version === 'number' && data.sessions && typeof data.sessions === 'object' && typeof data.lastUpdated === 'number'; }
  async dispose() { if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; } await this.flush(); this.pendingData = null; }
}

module.exports = { ExpertHistoryStorage };
