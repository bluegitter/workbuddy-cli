'use strict';

const fs = require('fs').promises;
const path = require('path');
const META_FILENAME = 'sessions.json';
const MAX_ENTRIES = 10;

class SessionMetaWriter {
  constructor(baseDir, logger) { this.logger = logger; this.filePath = path.join(baseDir, META_FILENAME); this.cache = undefined; this.writeQueue = Promise.resolve(); }
  record(input) { this.writeQueue = this.writeQueue.then(() => this.doRecord(input)).catch((error) => this.logger?.warn?.('[SessionMeta] record failed:', error instanceof Error ? error.message : String(error))); return this.writeQueue; }
  async doRecord(input) {
    const entries = await this.loadEntries();
    const now = new Date().toISOString();
    const index = entries.findIndex((entry) => entry.conversationId === input.conversationId);
    if (index >= 0) { const existing = entries[index]; existing.resumedAt = now; if (input.title !== undefined) existing.title = input.title; entries.splice(index, 1); entries.unshift(existing); }
    else { const entry = { conversationId: input.conversationId, userId: input.userId, workDir: input.workDir, startedAt: now, resumedAt: now }; if (input.title != null) entry.title = input.title; entries.unshift(entry); }
    entries.length = Math.min(entries.length, MAX_ENTRIES); this.cache = entries; await this.atomicWrite(entries);
  }
  async loadEntries() { if (this.cache) return this.cache; try { const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')); if (Array.isArray(parsed?.sessions)) return (this.cache = parsed.sessions); } catch {} return (this.cache = []); }
  async atomicWrite(entries) { const directory = path.dirname(this.filePath); await fs.mkdir(directory, { recursive: true }); const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`; await fs.writeFile(tmpPath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), sessions: entries }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await fs.rename(tmpPath, this.filePath); }
}

module.exports = Object.freeze({ META_FILENAME, MAX_ENTRIES, SessionMetaWriter });
