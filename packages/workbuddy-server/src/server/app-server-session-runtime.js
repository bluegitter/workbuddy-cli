'use strict';
const path = require('node:path');
const { TerminalProxy } = require('../runtime/terminal-proxy');

function isIgnoredCwd(session, ignoredCwd) { const cwd = typeof session?.cwd === 'string' ? session.cwd.trim() : ''; return Boolean(ignoredCwd && cwd && path.resolve(cwd).toLowerCase() === path.resolve(ignoredCwd).toLowerCase()); }
function attachWorkbuddyAppServerSessionRuntime(options) {
  const logger = options.logger || console; let routeState = {};
  const isSessionIgnored = (session) => isIgnoredCwd(session, options.ignoredCwd) || (options.windowFocus?.isFocused?.() && routeState.taskId === session?.sessionId);
  const reclaimOptions = { ...(options.reclaimPolicy || {}), isSessionIgnored };
  const scheduleRuntimeSweep = () => options.sessionManager.reclaimInactiveSessions?.(reclaimOptions).catch((error) => logger.warn?.('[SessionManager] runtime sweep failed', error));
  options.sessionManager.startRuntimeReclaimJanitor?.({ ...reclaimOptions, sweepIntervalMs: options.sweepIntervalMs });
  options.endpoint.onAllClientsDisconnected?.(() => options.handlers?.auxiliary?.getFileWatchService?.()?.releaseAllSubscriptions?.());
  options.registerHandlers?.(options.endpoint, options.handlers, { updateRouteState: (next) => { const record = next && typeof next === 'object' ? next : {}; routeState = { pathname: typeof record.pathname === 'string' ? record.pathname : undefined, taskId: typeof record.taskId === 'string' ? record.taskId : undefined }; } });
  const terminalProxy = startTerminalProxy(options);
  return { scheduleRuntimeSweep, stop() { options.sessionManager.stopRuntimeReclaimJanitor?.(); terminalProxy?.stop(); } };
}
function attachWorkbuddyAppServerDefaultSessionRuntime(options) { return attachWorkbuddyAppServerSessionRuntime(options); }
function startTerminalProxy(options) { const server = options.endpoint?.getHttpServer?.(); if (!server || !options.resolveDataSocketPath) return undefined; const proxy = new TerminalProxy({ resolveDataSocketPath: options.resolveDataSocketPath, logger: options.logger || console }); proxy.start(server, options.endpoint.getToken?.() || ''); return proxy; }
module.exports = Object.freeze({ isIgnoredCwd, attachWorkbuddyAppServerSessionRuntime, attachWorkbuddyAppServerDefaultSessionRuntime, startTerminalProxy });
