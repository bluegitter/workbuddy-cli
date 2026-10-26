'use strict';

const fs = require('fs');

async function acquireFileLock(lockPath, options = {}) {
  const ttlMs = options.ttlMs ?? 10_000;
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 150;
  const ownerId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await fs.promises.writeFile(lockPath, JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), ownerId }), { flag: 'wx', encoding: 'utf8' });
      return {
        ownerId,
        release: async () => {
          try {
            const raw = await fs.promises.readFile(lockPath, 'utf8');
            if (JSON.parse(raw).ownerId !== ownerId) return;
          } catch {}
          await fs.promises.unlink(lockPath).catch(() => {});
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') return null;
      try {
        const current = JSON.parse(await fs.promises.readFile(lockPath, 'utf8'));
        if (Date.now() - current.acquiredAt > ttlMs) await fs.promises.unlink(lockPath);
      } catch { await fs.promises.unlink(lockPath).catch(() => {}); }
      if (attempt < maxRetries) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  return null;
}

module.exports = { acquireFileLock };
