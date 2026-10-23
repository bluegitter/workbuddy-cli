'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LOCK_STALE_MS = 300_000;

class MarketplaceCache {
  constructor(options = {}) {
    this.baseDir = options.baseDir;
    this.metaPath = options.metaPath || path.join(path.dirname(this.baseDir || ''), 'marketplace-meta.json');
    this.lockPath = options.lockPath || path.join(path.dirname(this.baseDir || ''), 'marketplace.lock');
    this.logger = options.logger || { warn() {} };
    this.pid = options.pid || process.pid;
    this.now = options.now || Date.now;
  }

  readMeta() {
    try {
      const value = JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
      return typeof value.sha256 === 'string' && value.sha256 ? { etag: value.etag ?? null, sha256: value.sha256 } : null;
    } catch { return null; }
  }

  saveMeta(fingerprint) {
    try { fs.mkdirSync(path.dirname(this.metaPath), { recursive: true }); fs.writeFileSync(this.metaPath, JSON.stringify(fingerprint, null, 2), 'utf8'); return true; }
    catch (error) { this.logger.warn?.('[MarketplaceCache] failed to save metadata', error); return false; }
  }

  fingerprint(buffer, etag = null) { return { etag: normalizeEtag(etag), sha256: crypto.createHash('sha256').update(buffer).digest('hex') }; }

  acquireLock() {
    try {
      fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
      if (fs.existsSync(this.lockPath) && this.isHeldByOther()) return false;
      fs.writeFileSync(this.lockPath, JSON.stringify({ pid: this.pid, timestamp: this.now() }), 'utf8');
      return JSON.parse(fs.readFileSync(this.lockPath, 'utf8')).pid === this.pid;
    } catch (error) { this.logger.warn?.('[MarketplaceCache] failed to acquire lock', error); return false; }
  }

  isHeldByOther() {
    let info;
    try { info = JSON.parse(fs.readFileSync(this.lockPath, 'utf8')); }
    catch { try { fs.rmSync(this.lockPath, { force: true }); } catch {} return false; }
    if (info.pid === this.pid || Math.abs(this.now() - Number(info.timestamp)) >= LOCK_STALE_MS) return false;
    try { process.kill(info.pid, 0); return true; } catch { return false; }
  }

  releaseLock() {
    try {
      if (!fs.existsSync(this.lockPath)) return;
      const info = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
      if (info.pid === this.pid) fs.rmSync(this.lockPath, { force: true });
    } catch {}
  }

  replaceDirectory(sourceDir) {
    if (!this.baseDir) throw new Error('baseDir is required');
    if (!this.acquireLock()) return false;
    try {
      fs.rmSync(this.baseDir, { recursive: true, force: true });
      try { fs.renameSync(sourceDir, this.baseDir); }
      catch { copyDirectory(sourceDir, this.baseDir); }
      return true;
    } finally { this.releaseLock(); }
  }
}

function normalizeEtag(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (value.startsWith('W/')) value = value.slice(2).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return value || null;
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name); const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to); else fs.copyFileSync(from, to);
  }
}

module.exports = { LOCK_STALE_MS, MarketplaceCache, copyDirectory, normalizeEtag };
