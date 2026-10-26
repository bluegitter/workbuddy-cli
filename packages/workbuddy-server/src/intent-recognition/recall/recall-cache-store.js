'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RECALL_KIND = Object.freeze({ Skill: 'skill', Plugin: 'plugin', Connector: 'connector' });
const RECALL_KINDS_ALL = Object.freeze(Object.values(RECALL_KIND));
const SUGGESTED_KINDS = Object.freeze([...RECALL_KINDS_ALL]);

class RecallCacheStore {
  constructor(baseDir) { this.baseDir = baseDir; }
  static hashText(text) { return crypto.createHash('sha1').update(text).digest('hex'); }
  fileFor(kind, textHash) { return path.join(this.baseDir, kind, `${textHash}.json`); }
  async get(kind, textHash) { try { const value = JSON.parse(await fs.promises.readFile(this.fileFor(kind, textHash), 'utf8')); return value.embeddingBase64 && value.model ? value : undefined; } catch { return undefined; } }
  async set(kind, textHash, entry) { const file = this.fileFor(kind, textHash); await fs.promises.mkdir(path.dirname(file), { recursive: true }); const temp = `${file}.tmp`; await fs.promises.writeFile(temp, JSON.stringify(entry), 'utf8'); await fs.promises.rename(temp, file); }
  async cleanupStale(kind, validHashes) { let entries; try { entries = await fs.promises.readdir(path.join(this.baseDir, kind)); } catch { return 0; } let removed = 0; for (const name of entries) { if (!name.endsWith('.json')) continue; const hash = name.slice(0, -5); if (validHashes.has(hash)) continue; try { await fs.promises.unlink(path.join(this.baseDir, kind, name)); removed += 1; } catch {} } return removed; }
}
function decodeEmbeddingBase64(base64) { const buffer = Buffer.from(base64, 'base64'); return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4))); }
function cosineSimilarity(a, b) { if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0; let dot = 0; let na = 0; let nb = 0; for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0; }
module.exports = Object.freeze({ RECALL_KIND, RECALL_KINDS_ALL, SUGGESTED_KINDS, RecallCacheStore, decodeEmbeddingBase64, cosineSimilarity });
