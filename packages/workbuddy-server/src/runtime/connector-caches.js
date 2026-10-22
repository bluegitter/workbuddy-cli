'use strict';

const fs = require('fs');

class JsonFileCache {
  constructor(read) {
    if (typeof read !== 'function') throw new TypeError('JsonFileCache requires a read function');
    this.read = read;
    this.entries = new Map();
  }

  get(filePath) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      this.entries.delete(filePath);
      return this.read(filePath);
    }
    const cached = this.entries.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.value;
    const value = this.read(filePath);
    this.entries.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value });
    return value;
  }

  invalidate(filePath) {
    if (filePath === undefined) this.entries.clear();
    else this.entries.delete(filePath);
  }
}

function safeReadJsonFile(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

class TtlMemoCache {
  constructor(compute, ttlMs) {
    if (typeof compute !== 'function') throw new TypeError('TtlMemoCache requires a compute function');
    this.compute = compute;
    this.ttlMs = ttlMs;
    this.cached = undefined;
  }

  get() {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.value;
    const value = this.compute();
    this.cached = { value, at: Date.now() };
    return value;
  }

  invalidate() { this.cached = undefined; }
}

module.exports = Object.freeze({ JsonFileCache, TtlMemoCache, safeReadJsonFile });
