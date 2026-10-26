'use strict';
const http = require('node:http');
const { createMcpAppsHost } = require('../mcp-apps');
function listenOnLoopback(server) { return new Promise((resolve, reject) => { const onError = (error) => { cleanup(); reject(error); }; const onListening = () => { cleanup(); resolve(); }; const cleanup = () => { server.off('error', onError); server.off('listening', onListening); }; server.once('error', onError); server.once('listening', onListening); server.listen(0, '127.0.0.1'); }); }
function closeHttpServer(server, logger = console) { server.close((error) => error && logger.warn?.('[McpAppsHost] dedicated HTTP server close failed', error)); }
async function startWorkbuddyAppServerMcpAppsHost(options) {
  const sharedHttpServer = options.daemon.server.getHttpServer?.(); const ownedHttpServer = sharedHttpServer ? undefined : http.createServer();
  if (ownedHttpServer) await listenOnLoopback(ownedHttpServer);
  const { celljs, serverFetch, connectorOauthFetch, logger = console } = options;
  const tmapProxyFetch = serverFetch ? async ({ subPath, search }) => { const session = celljs.authenticationManager?.currentSessionSubject?.getValue?.(); const endpoint = (celljs.productManager.getEndpoint?.() || '').replace(/\/$/, ''); const headers = { 'Accept-Encoding': 'identity' }; if (session?.auth?.accessToken) headers.Authorization = `Bearer ${session.auth.accessToken}`; if (session?.account?.uid) headers['X-User-Id'] = session.account.uid; if (session?.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; } const response = await serverFetch(`${endpoint}/agenttool/glmap${subPath}${search}`, { method: 'GET', headers }); const body = Buffer.from(await response.arrayBuffer()); const responseHeaders = {}; response.headers.forEach((value, key) => { responseHeaders[key] = value; }); return { status: response.status, headers: responseHeaders, body }; } : undefined;
  const factory = options.createMcpAppsHost || createMcpAppsHost; let handle;
  try { handle = factory({ proxy: celljs.connectorMcpProxy, server: options.daemon.server, httpServer: sharedHttpServer || ownedHttpServer, ardotAuthService: { connectorOauthAccessToken: () => options.callConnectorOauthAccessToken?.(connectorOauthFetch) }, logger, resolveBundledAsset: options.resolveBundledAsset, rawSink: options.daemon.rawSink, tmapProxyFetch }); } catch (error) { if (ownedHttpServer) closeHttpServer(ownedHttpServer, logger); throw error; }
  if (!ownedHttpServer) return handle;
  let stopped = false; return { ...handle, stop() { if (stopped) return; stopped = true; try { handle.stop?.(); } finally { closeHttpServer(ownedHttpServer, logger); } } };
}
async function startWorkbuddyAppServerDefaultMcpAppsHost(options) { return startWorkbuddyAppServerMcpAppsHost({ ...options, createMcpAppsHost: options.createMcpAppsHost || createMcpAppsHost }); }
module.exports = Object.freeze({ listenOnLoopback, closeHttpServer, startWorkbuddyAppServerMcpAppsHost, startWorkbuddyAppServerDefaultMcpAppsHost });
