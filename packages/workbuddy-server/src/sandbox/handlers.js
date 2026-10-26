'use strict';

const fs = require('node:fs');
const { handleRpc } = require('../server/handler-registry');
const { gatewaySecretHeaders } = require('../agent/gateway-secret');

const TAG = '[SandboxHandlers]';
const APP_SERVER_SECURITY_HEADER = 'x-codebuddy-request';
const VERSION_CACHE_TEXT_SIZE_CAP = 2 * 1024 * 1024;

function withAppServerSecurityHeader(headers = {}) {
  return { ...headers, [APP_SERVER_SECURITY_HEADER]: '1', ...gatewaySecretHeaders() };
}

async function isBinaryFile(filePath) {
  const data = await fs.promises.readFile(filePath);
  for (const byte of data.subarray(0, 8192)) if (byte === 0) return true;
  return false;
}

async function resolveSessionHttpBase(runtimeManager, sessionManager, sessionId, logger = console) {
  if (!runtimeManager || !sessionId) return undefined;
  try {
    const runtime = await runtimeManager;
    const active = (await runtime.listSessions()).find((entry) => entry.sessionId === sessionId)?.acpEndpoint;
    if (typeof active === 'string' && active) return active.replace(/\/api\/v1\/acp\/?$/, '');
    const sessions = await sessionManager;
    if (!sessions.resumeSession) return undefined;
    logger.info?.(`${TAG} session ${sessionId} has no active sidecar, resuming on-demand`);
    let cwd = sessions.getSession?.(sessionId)?.cwd;
    if (!cwd) cwd = (await sessions.getSessionRecord?.(sessionId).catch(() => null))?.cwd;
    await sessions.resumeSession(sessionId, cwd);
    const resumed = (await runtime.listSessions()).find((entry) => entry.sessionId === sessionId)?.acpEndpoint;
    return typeof resumed === 'string' && resumed ? resumed.replace(/\/api\/v1\/acp\/?$/, '') : undefined;
  } catch (error) {
    logger.warn?.(`${TAG} resolveSessionHttpBase failed:`, error);
    return undefined;
  }
}

async function requireSessionHttpBase(runtimeManager, sessionManager, sessionId, logger) {
  const base = await resolveSessionHttpBase(runtimeManager, sessionManager, sessionId, logger);
  if (!base) throw new Error('sandbox session not available');
  return base;
}

function registerSandboxHandlers(registry, deps) {
  const sessionManager = Promise.resolve(deps.sessionManager);
  const runtimeManager = deps.runtimeManager ? Promise.resolve(deps.runtimeManager) : undefined;
  const fetchFn = deps.fetchFn || fetch;
  const logger = deps.logger || console;
  const binaryFile = deps.isBinaryFile || isBinaryFile;
  const readTextFile = deps.readTextFile || ((filePath) => fs.promises.readFile(filePath, 'utf8'));
  const register = (name, handler) => handleRpc(registry, name, handler);

  if (deps.getSandboxPreviewMountService && deps.getSandboxPreviewHttpPort) {
    register('sandboxPreviewRegisterMount', async (params) => {
      const service = deps.getSandboxPreviewMountService();
      if (!service) throw new Error('sandbox preview mount service not ready');
      return service.registerMount(params, deps.getSandboxPreviewHttpPort());
    });
  }

  register('sandboxRespondToIntercept', async (params) => {
    await (await sessionManager).respondToSandboxIntercept(params.sessionId, params.requestId, params.choice);
  });

  const request = async (runtime, params, path, fallback) => {
    const base = await requireSessionHttpBase(runtimeManager, sessionManager, params?.sessionId, logger);
    const response = await fetchFn(`${base}${path}`, {
      method: 'POST',
      headers: withAppServerSecurityHeader({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(runtime(params)),
    });
    const json = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(json?.error?.message || `${runtime.name || 'request'} failed: HTTP ${response.status}`);
    return json?.data ?? fallback;
  };

  register('sandboxListFileCommits', async (params) => {
    const base = await resolveSessionHttpBase(runtimeManager, sessionManager, params?.sessionId, logger);
    if (!base) return { commits: [] };
    const response = await fetchFn(`${base}/api/v1/file-version/commits`, {
      method: 'POST', headers: withAppServerSecurityHeader({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessionId: params.sessionId, limit: params.limit }),
    });
    if (!response.ok) { logger.warn?.(`${TAG} listCommits HTTP ${response.status}: ${await response.text().catch(() => '')}`); return { commits: [] }; }
    return (await response.json().catch(() => undefined))?.data ?? { commits: [] };
  });

  register('sandboxRevertFileCommit', (params) => request((value) => value, params, '/api/v1/file-version/revert', { commitId: params.commitId, filesAffected: 0, files: [] }));
  register('sandboxResetFileCommit', (params) => request((value) => value, params, '/api/v1/file-version/reset', { commitId: params.commitId, filesAffected: 0, files: [] }));
  register('sandboxQueryFileVersionCache', async (params) => {
    if (!params?.relativePath) throw new Error('relativePath is required');
    const data = await request((value) => ({ sessionId: value.sessionId, relativePath: value.relativePath, versions: value.versions }), params, '/api/v1/file-version/version-cache', { entries: [], missingVersions: [] });
    const entries = [];
    for (const entry of data.entries || []) {
      try {
        if (await binaryFile(entry.cachePath)) entries.push({ version: entry.version, isBinary: true, fileSize: entry.fileSize });
        else if (entry.fileSize > VERSION_CACHE_TEXT_SIZE_CAP) entries.push({ version: entry.version, isBinary: false, fileSize: entry.fileSize, oversize: true });
        else entries.push({ version: entry.version, isBinary: false, fileSize: entry.fileSize, content: await readTextFile(entry.cachePath) });
      } catch (error) {
        logger.warn?.(`${TAG} read cachePath failed for version=${entry.version}:`, error);
        entries.push({ version: entry.version, isBinary: false, fileSize: entry.fileSize, oversize: true });
      }
    }
    return { entries, missingVersions: data.missingVersions || [] };
  });
  return registry;
}

module.exports = { registerSandboxHandlers, withAppServerSecurityHeader, resolveSessionHttpBase, requireSessionHttpBase };
