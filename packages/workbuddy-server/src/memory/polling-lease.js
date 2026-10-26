'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
function createMemoryPollingLease(options) {
  const ownerId = crypto.randomUUID(); let isOwner = false; let expireAt = 0; let heartbeatAt = 0; let timer; let lastError;
  const log = (level, message, fields) => options.log?.(level, message, { ...fields, ownerId, leasePath: options.leasePath, isOwner, expireAt });
  const clearTimer = () => { if (timer) { clearInterval(timer); timer = undefined; } };
  const read = async () => { try { return JSON.parse(await fs.readFile(options.leasePath, 'utf8')); } catch { return undefined; } };
  const write = async (payload) => { await fs.mkdir(path.dirname(options.leasePath), { recursive: true }); await fs.writeFile(options.leasePath, JSON.stringify(payload), 'utf8'); };
  const renew = async () => { const now = Date.now(); const current = await read(); if (current && current.ownerId !== ownerId && current.expireAt > now) { isOwner = false; expireAt = current.expireAt; heartbeatAt = current.heartbeatAt ?? 0; return false; } const payload = { ownerId, pid: process.pid, hostname: os.hostname(), acquiredAt: current?.ownerId === ownerId ? current.acquiredAt ?? now : now, heartbeatAt: now, expireAt: now + options.ttlMs }; await write(payload); isOwner = true; expireAt = payload.expireAt; heartbeatAt = now; lastError = undefined; return true; };
  return { start: async (reason) => { try { const acquired = await renew(); clearTimer(); timer = setInterval(() => renew().catch((error) => { lastError = error?.message ?? String(error); log('warn', 'lease renew failed', { reason: lastError }); }), options.heartbeatMs); timer.unref?.(); log('info', acquired ? 'lease acquired' : 'lease not acquired', { reason }); return acquired; } catch (error) { lastError = error?.message ?? String(error); isOwner = false; log('error', 'lease start failed', { reason: lastError }); return false; } }, stop: async (reason) => { clearTimer(); if ((await read())?.ownerId === ownerId) await fs.rm(options.leasePath, { force: true }); isOwner = false; expireAt = 0; heartbeatAt = 0; log('info', 'lease released', { reason }); }, isOwner: () => isOwner, getSnapshot: () => ({ ownerId, isOwner, leasePath: options.leasePath, expireAt, heartbeatAt, lastError }) };
}
module.exports = Object.freeze({ createMemoryPollingLease });
