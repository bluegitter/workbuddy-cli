'use strict';

const crypto = require('node:crypto');

const TAG = '[HostServices][MemoryArchive]';
function generateTraceId() { return crypto.randomBytes(4).toString('hex'); }
function maskUid(uid) { if (!uid || uid.length <= 8) return '****'; return `${uid.slice(0, 4)}***${uid.slice(-4)}`; }
function createArchiveLogger(sink, options = {}) {
  const infoEvery = Math.max(1, options.sampling?.infoEvery ?? 10); const debugEnabled = options.debug ?? process.env.WORKBUDDY_MEMORY_ARCHIVE_DEBUG === '1'; const counters = new Map();
  const sampled = (uid, key) => { const counterKey = `${uid}:${key}`; const count = (counters.get(counterKey) || 0) + 1; counters.set(counterKey, count); return count % infoEvery === 1 ? 'info' : 'debug'; };
  const log = (level, stage, fields = {}) => sink(level, `${TAG} ${stage}`, { ...fields, uid: typeof fields.uid === 'string' ? maskUid(fields.uid) : fields.uid });
  return { start: (fields) => log(debugEnabled ? 'info' : sampled(fields.uid, 'start'), 'start', fields), done: (fields) => log(debugEnabled || fields.version !== undefined ? 'info' : 'debug', 'done', fields), failed: (fields) => { log('error', 'failed', fields); options.onError?.(fields); }, timeout: (fields) => { log('warn', 'timeout', fields); options.onError?.({ ...fields, error_code: 'timeout' }); }, skipped: (fields) => log(fields.reason === 'stale_version' ? 'warn' : debugEnabled ? 'info' : sampled(fields.uid, 'skipped_same_version'), `skipped_${fields.reason}`, fields), migrated: (fields) => log('info', 'migrated', fields), lockContention: (fields) => { log('warn', 'lock_contention', fields); options.onError?.({ ...fields, error_code: 'lock_contention' }); } };
}

module.exports = { TAG, generateTraceId, maskUid, createArchiveLogger };
