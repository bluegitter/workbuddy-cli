'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { acquireMutex } = require('./async-mutex');
const { TimeoutError, withTimeout } = require('./with-timeout');
const { resolveMemoryDirs, sanitizeFilename } = require('./path-resolver');

const DEFAULT_WRITE_TIMEOUT_MS = 2000;
const DEFAULT_READ_TIMEOUT_MS = 1500;
const DEFAULT_DELETE_TIMEOUT_MS = 1500;
const defaultLog = (level, message, fields) => console[level]?.(`[PendingMutationStore] ${message}${fields ? ` ${JSON.stringify(fields)}` : ''}`);
const getLog = (options) => options?.log ?? defaultLog;
const resolvePrimaryDir = (options) => options?.baseDir ?? resolveMemoryDirs().primaryDir;
const buildFileName = (uid) => `.pending-mutation-${sanitizeFilename(uid)}.json`;
const buildFilePath = (uid, options) => path.join(resolvePrimaryDir(options), buildFileName(uid));
const tempPath = (file) => `${file}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

async function writePendingMutation(uid, payload, options) {
  const log = getLog(options); const file = buildFilePath(uid, options); const tmp = tempPath(file); const release = await acquireMutex(`${uid}:pending`);
  try { await withTimeout(async (signal) => { await fs.promises.mkdir(path.dirname(file), { recursive: true }); await fs.promises.writeFile(tmp, JSON.stringify(payload, null, 2), { encoding: 'utf8', signal }); await fs.promises.rename(tmp, file); }, options?.timeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS, 'pending-mutation-write'); }
  catch (error) { await fs.promises.unlink(tmp).catch(() => {}); log('warn', error instanceof TimeoutError ? 'writePendingMutation timeout' : 'writePendingMutation failed', { uid: sanitizeFilename(uid), error: error?.message ?? String(error) }); }
  finally { release(); }
}
async function readPendingMutation(uid, options) {
  const log = getLog(options); const file = buildFilePath(uid, options);
  try { return await withTimeout(async (signal) => { let raw; try { raw = await fs.promises.readFile(file, { encoding: 'utf8', signal }); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } const parsed = JSON.parse(raw); if (!parsed || parsed.uid !== uid || typeof parsed.mutationStartedAt !== 'number' || !Number.isFinite(parsed.mutationStartedAt)) return null; return { uid: parsed.uid, mutationStartedAt: parsed.mutationStartedAt, baselineVersion: typeof parsed.baselineVersion === 'number' ? parsed.baselineVersion : undefined, lastVersion: typeof parsed.lastVersion === 'number' ? parsed.lastVersion : undefined, source: ['submit', 'import', 'clear'].includes(parsed.source) ? parsed.source : undefined, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString() }; }, options?.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS, 'pending-mutation-read'); }
  catch (error) { log('warn', error instanceof TimeoutError ? 'readPendingMutation timeout' : 'readPendingMutation failed', { uid: sanitizeFilename(uid), error: error?.message ?? String(error) }); return null; }
}
async function clearPendingMutation(uid, options) {
  const log = getLog(options); const file = buildFilePath(uid, options); const release = await acquireMutex(`${uid}:pending`);
  try { await withTimeout(async () => { try { await fs.promises.unlink(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }, options?.timeoutMs ?? DEFAULT_DELETE_TIMEOUT_MS, 'pending-mutation-clear'); }
  catch (error) { log('warn', error instanceof TimeoutError ? 'clearPendingMutation timeout' : 'clearPendingMutation failed', { uid: sanitizeFilename(uid), error: error?.message ?? String(error) }); }
  finally { release(); }
}
module.exports = Object.freeze({ DEFAULT_WRITE_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS, DEFAULT_DELETE_TIMEOUT_MS, buildFileName, buildFilePath, writePendingMutation, readPendingMutation, clearPendingMutation });
