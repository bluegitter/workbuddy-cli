'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createFileService } = require('./service');

function appendFileServiceAllowlistLog(configDir, payload) { try { const dir = path.join(configDir, 'logs'); fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'file-service.log'), `${JSON.stringify({ time: new Date().toISOString(), event: 'fileRead allowlist', ...payload })}\n`, 'utf8'); } catch {} }
async function resolveAllowedDirs(options, sessionManager) { const sessionId = typeof options?.sessionId === 'string' ? options.sessionId.trim() : ''; let cwd; if (sessionId) { cwd = sessionManager?.getSession?.(sessionId)?.cwd; if (!cwd) cwd = (await sessionManager?.getSessionRecord?.(sessionId)?.catch?.(() => null))?.cwd; } const caller = Array.isArray(options?.allowedDirs) ? options.allowedDirs.filter((dir) => typeof dir === 'string' && dir.trim()) : []; return { sessionId, cwd, allowedDirs: [...(cwd ? [cwd] : []), ...caller] }; }
function registerFileHandlers(registry, deps = {}) {
  const services = Promise.resolve(deps.services); const service = services.then((value) => deps.fileService || createFileService({ configDir: value.file.configDir })); const handle = deps.handleRpc || ((target, channel, fn) => target.handle(channel, fn));
  handle(registry, 'fileRead', async (filePath, encoding, options) => { const access = await resolveAllowedDirs(options, deps.sessionManager); const configDir = (await services).file.configDir; appendFileServiceAllowlistLog(configDir, { filePath, encoding: encoding || 'utf-8', ...access }); return (await service).read(filePath, encoding || 'utf-8', access.allowedDirs.length ? { allowedDirs: access.allowedDirs } : undefined); });
  handle(registry, 'fileWrite', async (filePath, content, encoding, options) => { const access = await resolveAllowedDirs(options, deps.sessionManager); return (await service).write(filePath, content, encoding || 'utf-8', access.allowedDirs.length ? { allowedDirs: access.allowedDirs } : undefined); });
  handle(registry, 'fileWriteBatch', async (files, options) => { const access = await resolveAllowedDirs(options, deps.sessionManager); return (await service).writeBatch(files, access.allowedDirs.length ? { allowedDirs: access.allowedDirs } : undefined); });
  const routes = { fileListDir: 'listDirectory', fileExists: 'exists', fileMakeDir: 'makeDirectory', fileRemove: 'remove', fileRename: 'rename', fileGetInfo: 'getInfo', fileSearch: 'search', ioAppendRecord: 'appendRecord' };
  for (const [channel, method] of Object.entries(routes)) handle(registry, channel, (...args) => service.then((value) => value[method](...args)));
  handle(registry, 'fileReadChunked', async (params) => { if (!params || typeof params.filePath !== 'string' || !params.filePath) throw new Error('[fileReadChunked] invalid filePath'); if (typeof params.offset !== 'number' || params.offset < 0) throw new Error('[fileReadChunked] invalid offset'); const access = await resolveAllowedDirs(params, deps.sessionManager); return (await service).readChunked(params, access.allowedDirs.length ? { allowedDirs: access.allowedDirs } : undefined); });
  return registry;
}

module.exports = { appendFileServiceAllowlistLog, resolveAllowedDirs, registerFileHandlers };
