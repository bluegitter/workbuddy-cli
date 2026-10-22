'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');

const PAC_RPC_SOCKET_ENV = 'WORKBUDDY_PAC_RPC_SOCKET';
const PAC_RPC_TOKEN_ENV = 'WORKBUDDY_PAC_RPC_TOKEN';
const USE_SYSTEM_CA_NODE_OPTION = '--use-system-ca';

function mergeNoProxy(value = '') {
  const entries = new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
  entries.add('127.0.0.1'); entries.add('localhost');
  return [...entries].join(',');
}
function normalizeProxyUrl(value, protocol = 'http') {
  try { const url = new URL(value.includes('://') ? value : `${protocol}://${value}`); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined; } catch { return undefined; }
}
function parseElectronProxyRules(rules = '') {
  for (const item of rules.split(';')) {
    const [kind, value] = item.trim().split(/\s+/, 2);
    if (!value || kind.toUpperCase() === 'DIRECT') continue;
    const protocol = kind.toUpperCase() === 'HTTPS' ? 'https' : kind.toUpperCase() === 'PROXY' || kind.toUpperCase() === 'HTTP' ? 'http' : undefined;
    const proxy = protocol && normalizeProxyUrl(value, protocol);
    if (proxy) return proxy;
  }
  return undefined;
}
function getProxyEnvFromProcess(env = process.env) {
  const httpProxy = env.HTTP_PROXY || env.http_proxy;
  const httpsProxy = env.HTTPS_PROXY || env.https_proxy;
  const result = {};
  if (httpProxy) result.HTTP_PROXY = httpProxy;
  if (httpsProxy) result.HTTPS_PROXY = httpsProxy;
  if (httpProxy || httpsProxy) { result.NO_PROXY = mergeNoProxy(env.NO_PROXY || env.no_proxy); result.NODE_OPTIONS = USE_SYSTEM_CA_NODE_OPTION; if (env.WORKBUDDY_PROXY_SOURCE) result.WORKBUDDY_PROXY_SOURCE = env.WORKBUDDY_PROXY_SOURCE; }
  if (env[PAC_RPC_SOCKET_ENV] && env[PAC_RPC_TOKEN_ENV]) { result[PAC_RPC_SOCKET_ENV] = env[PAC_RPC_SOCKET_ENV]; result[PAC_RPC_TOKEN_ENV] = env[PAC_RPC_TOKEN_ENV]; }
  return result;
}
function getProxyEnvFromElectronProxyRules(rules, env = process.env) {
  const result = getProxyEnvFromProcess({ [PAC_RPC_SOCKET_ENV]: env[PAC_RPC_SOCKET_ENV], [PAC_RPC_TOKEN_ENV]: env[PAC_RPC_TOKEN_ENV] });
  const proxy = parseElectronProxyRules(rules);
  return proxy ? { ...result, HTTP_PROXY: proxy, HTTPS_PROXY: proxy, NO_PROXY: mergeNoProxy(env.NO_PROXY || env.no_proxy), NODE_OPTIONS: USE_SYSTEM_CA_NODE_OPTION, WORKBUDDY_PROXY_SOURCE: 'system' } : result;
}
function sanitizeProxyForLog(value) { try { const url = new URL(value.includes('://') ? value : `http://${value}`); url.username = ''; url.password = ''; return value.includes('://') ? url.toString() : url.host; } catch { return '<invalid-proxy-url>'; } }
function generatePacToken() { return crypto.randomBytes(24).toString('base64url'); }
function generatePacSocketPath(platform = process.platform, tempDirectory = os.tmpdir()) { const suffix = crypto.randomBytes(8).toString('hex'); return platform === 'win32' ? `\\\\.\\pipe\\workbuddy-pac-${process.pid}-${suffix}` : path.join(tempDirectory, `workbuddy-pac-${process.pid}-${suffix}.sock`); }

module.exports = Object.freeze({ PAC_RPC_SOCKET_ENV, PAC_RPC_TOKEN_ENV, USE_SYSTEM_CA_NODE_OPTION, generatePacSocketPath, generatePacToken, getProxyEnvFromElectronProxyRules, getProxyEnvFromProcess, mergeNoProxy, normalizeProxyUrl, parseElectronProxyRules, sanitizeProxyForLog });
