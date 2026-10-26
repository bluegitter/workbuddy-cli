'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { hashEntry } = require('./audit-log-utils');
const { verifySecurityAuditLog } = require('./audit-log-verifier');

const AUDIT_LOG_DIRNAME = 'audit-log';
const STATE_FILENAME = 'state.json';
const MANIFEST_FILENAME = 'manifest.jsonl';
const MAX_SEGMENT_BYTES = 50 * 1024 * 1024;

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
async function atomicWrite(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`); await fs.rename(tmp, file); }

class AuditLogStore {
  constructor(options = {}) { this.configDir = options.configDir; this.rootDir = path.join(this.configDir, AUDIT_LOG_DIRNAME); this.maxSegmentBytes = options.maxSegmentBytes || MAX_SEGMENT_BYTES; this.state = null; }
  async initialize() { await fs.mkdir(this.rootDir, { recursive: true }); this.state = await readJson(path.join(this.rootDir, STATE_FILENAME), { sequence: 0, lastHash: null, currentSegment: undefined }); return this.state; }
  segmentPath(timestamp = Date.now()) { const date = new Date(timestamp); const base = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; return path.join(this.rootDir, `${base}.jsonl`); }
  async append(event) { if (!this.state) await this.initialize(); const sequence = this.state.sequence + 1; const entry = { ...event, timestamp: event.timestamp || Date.now(), sequence, prevHash: this.state.lastHash }; entry.hash = hashEntry(entry); const file = this.segmentPath(entry.timestamp); await fs.mkdir(this.rootDir, { recursive: true }); await fs.appendFile(file, `${JSON.stringify(entry)}\n`); this.state = { ...this.state, sequence, lastHash: entry.hash, currentSegment: path.basename(file) }; await atomicWrite(path.join(this.rootDir, STATE_FILENAME), this.state); return entry; }
  async appendMany(entries) { const result = []; for (const entry of entries) result.push(await this.append(entry)); return result; }
  async query(query = {}) { const files = (await fs.readdir(this.rootDir).catch(() => [])).filter((name) => name.endsWith('.jsonl') && name !== MANIFEST_FILENAME).sort(); const all = []; for (const file of files) { const lines = (await fs.readFile(path.join(this.rootDir, file), 'utf8').catch(() => '')).split('\n'); for (const line of lines) { if (!line.trim()) continue; try { const entry = JSON.parse(line); if (query.category && entry.category !== query.category) continue; if (query.eventType && entry.eventType !== query.eventType) continue; if (query.decision && entry.decision !== query.decision) continue; all.push(entry); } catch {} } } const limit = Math.max(0, query.limit ?? 100); return { entries: all.slice(-limit), total: all.length, nextCursor: all.length > limit ? String(all[all.length - limit].sequence) : undefined }; }
  async clear() { await fs.rm(this.rootDir, { recursive: true, force: true }); this.state = null; await this.initialize(); }
  async verify() { return verifySecurityAuditLog(this.configDir); }
}

module.exports = Object.freeze({ AUDIT_LOG_DIRNAME, STATE_FILENAME, MANIFEST_FILENAME, MAX_SEGMENT_BYTES, AuditLogStore });
