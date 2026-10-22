'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BUILTIN_ARDOT_MCP_EMBED_URL = 'https://ardot.tencent.com';
const BUILTIN_ARDOT_MCP_DEFAULT_PORT = 50551;
const BUILTIN_ARDOT_MCP_URL = `http://127.0.0.1:${BUILTIN_ARDOT_MCP_DEFAULT_PORT}/api/v1/mcp`;
const BUILTIN_ARDOT_CLI_SEGMENTS = ['builtin-mcp-apps', 'ardot-mcp-app', 'cli.cjs'];
const BUILTIN_MCP_APP_BOOTSTRAP_SEGMENTS = ['builtin-mcp-apps', '_workbuddy-runtime', 'mcp-app-bootstrap.cjs'];
const BUILTIN_NETDRIVE_MCP_SERVER_NAME = 'netdrive';
const BUILTIN_NETDRIVE_MCP_PATH = '/console/agent-gateway/netdrive/mcp';
const NETDRIVE_HEADER_USER_ID = 'X-Genie-User-ID';
const NETDRIVE_HEADER_PROJECT_ID = 'X-Project-Id';

let bundledAssetResolver = defaultResolveBundledAsset;
let ardotEmbedUrlProvider = { resolveEmbedUrl: defaultResolveArdotEmbedUrl };

function defaultResolveBundledAsset(...segments) {
  const appPath = process.env.WORKBUDDY_APP_PATH || process.cwd();
  const resourcesPath = process.env.WORKBUDDY_RESOURCES_PATH?.trim();
  const candidates = [
    path.join(appPath, ...segments), path.join(appPath, 'resources', ...segments), path.join(appPath, '..', 'resources', ...segments),
    resourcesPath && path.join(resourcesPath, ...segments), resourcesPath && path.join(resourcesPath, 'resources', ...segments),
    resourcesPath && path.join(resourcesPath, 'app.asar.unpacked', ...segments), resourcesPath && path.join(resourcesPath, 'app.asar.unpacked', 'resources', ...segments),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function setConnectorBundledAssetResolver(resolver) { bundledAssetResolver = resolver; }
function setArdotEmbedUrlProvider(provider) { ardotEmbedUrlProvider = provider; }
function resolveArdotEmbedUrl() { return ardotEmbedUrlProvider.resolveEmbedUrl(); }

function defaultResolveArdotEmbedUrl() {
  if (process.env.NODE_ENV !== 'development') return BUILTIN_ARDOT_MCP_EMBED_URL;
  const configDir = process.env.WORKBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy');
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, 'dev-env.json'), 'utf8'));
    if (typeof parsed.ardotEndpointOverride === 'string' && isValidHttpUrl(parsed.ardotEndpointOverride.trim())) return parsed.ardotEndpointOverride.trim();
    if (parsed.env === 'staging') return 'https://test.ardot.tencent.com';
    if (typeof parsed.env === 'string' && parsed.env.startsWith('custom:')) {
      const custom = Array.isArray(parsed.customEnvs) ? parsed.customEnvs.find((entry) => entry?.name === parsed.env.slice(7)) : undefined;
      if (custom?.endpoint && isArdotHostUrl(custom.endpoint)) return custom.endpoint;
    }
  } catch {}
  return BUILTIN_ARDOT_MCP_EMBED_URL;
}

function isArdotHostUrl(endpoint) { try { return new URL(endpoint).hostname.includes('ardot'); } catch { return false; } }
function isValidHttpUrl(endpoint) { try { const url = new URL(endpoint); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } }
function resolveBuiltinArdotMcpCliPath() { return bundledAssetResolver(...BUILTIN_ARDOT_CLI_SEGMENTS); }
function resolveBuiltinMcpAppBootstrapPath() { return bundledAssetResolver(...BUILTIN_MCP_APP_BOOTSTRAP_SEGMENTS); }
function buildBuiltinArdotMcpUrl(port = BUILTIN_ARDOT_MCP_DEFAULT_PORT) { return `http://127.0.0.1:${port}/api/v1/mcp`; }

function isValidArdotDevMcpServer(entry) {
  if (!entry || typeof entry !== 'object' || entry.dev !== true) return false;
  if (typeof entry.url === 'string' && entry.url.trim()) return true;
  return typeof entry.command === 'string' && entry.command.trim() && Array.isArray(entry.args) && entry.args.some((arg) => typeof arg === 'string' && arg.includes('cli.cjs')) && typeof entry.env?.MCP_APP_EMBED_URL === 'string' && entry.env.MCP_APP_EMBED_URL.trim();
}

function createBuiltinArdotMcpServer(cliPath = resolveBuiltinArdotMcpCliPath(), url = BUILTIN_ARDOT_MCP_URL) { return cliPath ? { url, disabled: false, managedBy: 'workbuddy-builtin' } : undefined; }
function isValidNetdriveDevMcpServer(entry) { return Boolean(entry && typeof entry === 'object' && entry.dev === true && typeof entry.url === 'string' && entry.url.trim()); }

function createBuiltinNetdriveMcpServer(headers, url) {
  const userId = headers?.[NETDRIVE_HEADER_USER_ID];
  const authorization = headers?.Authorization;
  if (typeof userId !== 'string' || !userId.trim() || typeof authorization !== 'string' || !authorization.trim() || typeof url !== 'string' || !url.trim()) return undefined;
  const filteredHeaders = Object.fromEntries(Object.entries(headers).filter(([, value]) => typeof value === 'string' && value.length > 0));
  return { type: 'http', url, headers: filteredHeaders, disabled: false, managedBy: 'workbuddy-builtin', defer_loading: true };
}

module.exports = Object.freeze({ BUILTIN_ARDOT_MCP_EMBED_URL, BUILTIN_ARDOT_MCP_DEFAULT_PORT, BUILTIN_ARDOT_MCP_URL, BUILTIN_ARDOT_CLI_SEGMENTS, BUILTIN_MCP_APP_BOOTSTRAP_SEGMENTS, BUILTIN_NETDRIVE_MCP_SERVER_NAME, BUILTIN_NETDRIVE_MCP_PATH, NETDRIVE_HEADER_USER_ID, NETDRIVE_HEADER_PROJECT_ID, setConnectorBundledAssetResolver, defaultResolveBundledAsset, setArdotEmbedUrlProvider, defaultResolveArdotEmbedUrl, resolveArdotEmbedUrl, isArdotHostUrl, isValidHttpUrl, resolveBuiltinArdotMcpCliPath, resolveBuiltinMcpAppBootstrapPath, buildBuiltinArdotMcpUrl, isValidArdotDevMcpServer, createBuiltinArdotMcpServer, isValidNetdriveDevMcpServer, createBuiltinNetdriveMcpServer });
