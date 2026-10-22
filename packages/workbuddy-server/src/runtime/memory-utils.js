'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const mutexes = new Map();
const DEFAULT_WORKBUDDY_DIR_NAME = '.workbuddy';
const MEMORY_DIR_NAME = 'memory';
const LEGACY_MEMORY_DIR_NAME = 'memery';

async function acquireMutex(key) {
  const previous = mutexes.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  mutexes.set(key, previous.then(() => current));
  await previous;
  return release;
}

class TimeoutError extends Error {
  constructor(label, timeoutMs) { super(`operation "${label}" timed out after ${timeoutMs}ms`); this.name = 'TimeoutError'; this.label = label; this.timeoutMs = timeoutMs; }
}

function withTimeout(task, timeoutMs, label) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new TimeoutError(label, timeoutMs)); }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([task(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

function getWorkbuddyConfigBaseDir(homeDir = os.homedir()) { return process.env.WORKBUDDY_CONFIG_DIR?.trim() || path.join(homeDir, DEFAULT_WORKBUDDY_DIR_NAME); }
function resolveMemoryDirs(homeDir = os.homedir()) { const base = getWorkbuddyConfigBaseDir(homeDir); return { primaryDir: path.join(base, MEMORY_DIR_NAME), legacyDir: path.join(base, LEGACY_MEMORY_DIR_NAME) }; }
function sanitizeFilename(input) { return String(input).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim(); }
function buildArchiveFileName(uid, legacy = false) { return `${sanitizeFilename(uid)}_${legacy ? 'memery' : 'memory'}.md`; }
function buildBackupFileName(uid, legacy = false) { return `${buildArchiveFileName(uid, legacy)}.bak`; }

async function acquireFileLock(lockPath, options = {}) {
  const ttlMs = options.ttlMs ?? 10_000;
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 150;
  const ownerId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await fs.promises.writeFile(lockPath, JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), ownerId }), { flag: 'wx', encoding: 'utf8' });
      return { ownerId, release: async () => { try { const raw = await fs.promises.readFile(lockPath, 'utf8'); if (JSON.parse(raw).ownerId !== ownerId) return; } catch {} await fs.promises.unlink(lockPath).catch(() => {}); } };
    } catch (error) {
      if (error.code !== 'EEXIST') return null;
      try { const current = JSON.parse(await fs.promises.readFile(lockPath, 'utf8')); if (Date.now() - current.acquiredAt > ttlMs) await fs.promises.unlink(lockPath); } catch { await fs.promises.unlink(lockPath).catch(() => {}); }
      if (attempt < maxRetries) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  return null;
}

module.exports = Object.freeze({ acquireMutex, TimeoutError, withTimeout, getWorkbuddyConfigBaseDir, resolveMemoryDirs, sanitizeFilename, buildArchiveFileName, buildBackupFileName, acquireFileLock });
