'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ConnectorOAuthStore } = require('../../../authentication/src');

const CUSTOM_MCP_PREFIX = 'custom-mcp:';
const LEGACY_OAUTH_FILES = Object.freeze(['VSCode_mcp_oauth.json', 'VSCode_mcp_ide_oauth.json']);

class McpOAuthMigrationService {
  constructor(userIdProvider = () => undefined, options = {}) {
    this.userIdProvider = userIdProvider;
    this.homeDir = options.homeDir;
    this.configDir = options.configDir;
    this.backupBaseDir = options.backupBaseDir;
  }

  migrate(legacyDataRoot = getLegacyExtensionDataRoot(this.homeDir), mcpConfigPath = getMcpConfigPath(this.configDir, this.homeDir)) {
    const userId = this.userIdProvider() ?? 'default';
    const result = { targetPath: userId !== 'default' ? getTargetCredentialsPath(userId, this.configDir, this.homeDir) : '', userId, skipped: false, serversMatched: 0, serverNames: [], tokensMigrated: 0, clientInfoMigrated: 0 };
    if (!userId || userId === 'default') return { ...result, skipped: true, reason: 'pending_login' };
    const mcpServers = this.readMcpConfig(mcpConfigPath);
    if (!Object.keys(mcpServers).length) return { ...result, skipped: true, reason: 'no_mcp_servers_configured' };
    const legacy = this.readLegacySources(legacyDataRoot);
    if (!Object.keys(legacy.tokens).length && !Object.keys(legacy.clientInfo).length) return { ...result, skipped: true, reason: 'no_oauth_data_in_legacy_sources' };
    const store = new ConnectorOAuthStore(userId, { ...(this.homeDir ? { homeDir: this.homeDir } : {}), ...(this.backupBaseDir ? { backupBaseDir: this.backupBaseDir } : {}) });
    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      const serverUrl = serverConfig?.url;
      if (!serverUrl) continue;
      const legacyKey = generateLegacyKey(serverName, serverUrl);
      const token = legacy.tokens[legacyKey];
      const client = legacy.clientInfo[legacyKey];
      if (!token && !client) continue;
      result.serversMatched += 1;
      result.serverNames.push(serverName);
      const configId = `${CUSTOM_MCP_PREFIX}${serverName}`;
      if (store.loadTokens(configId, serverUrl)?.access_token) continue;
      if (token && store.saveTokens(configId, serverUrl, { access_token: token.access_token, token_type: token.token_type ?? 'bearer', refresh_token: token.refresh_token, expires_in: computeRemainingExpiresIn(token, client), scope: token.scope })) result.tokensMigrated += 1;
      if (client && store.saveClientInfo(configId, serverUrl, { client_id: client.client_id, client_secret: client.client_secret })) result.clientInfoMigrated += 1;
    }
    if (!result.serversMatched) return { ...result, skipped: true, reason: 'no_matching_credentials_for_configured_servers' };
    return result;
  }

  readMcpConfig(filePath) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')).mcpServers ?? {} : {}; } catch { return {}; }
  }

  readLegacySources(root) {
    const merged = { tokens: {}, clientInfo: {} };
    if (!fs.existsSync(root)) return merged;
    const files = [];
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const uidDir = path.join(root, entry.name);
        for (const [index, filename] of LEGACY_OAUTH_FILES.entries()) {
          const file = path.join(uidDir, filename);
          if (fs.existsSync(file)) files.push({ file, priority: index });
        }
      }
    } catch { return merged; }
    files.sort((a, b) => a.priority - b.priority);
    for (const { file } of files) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.tokens && typeof data.tokens === 'object') Object.assign(merged.tokens, data.tokens);
        if (data.clientInfo && typeof data.clientInfo === 'object') Object.assign(merged.clientInfo, data.clientInfo);
      } catch {}
    }
    return merged;
  }
}

function computeRemainingExpiresIn(token, client, now = Date.now()) {
  if (token?.expires_in === undefined) return undefined;
  if (client?.connect_time === undefined) return 0;
  return Math.max(0, Math.floor((client.connect_time + token.expires_in * 1000 - now) / 1000));
}

function generateLegacyKey(serverName, url) {
  const config = { url };
  return crypto.createHash('sha256').update(`${serverName}:${JSON.stringify(config, Object.keys(config).sort())}`).digest('hex');
}

function getLegacyExtensionBaseDir(homeDir = os.homedir(), platform = process.platform, env = process.env) {
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support');
  if (platform === 'win32') return env.LOCALAPPDATA?.trim() || path.join(homeDir, 'AppData', 'Local');
  return path.join(homeDir, '.local', 'share');
}
function getLegacyExtensionDataRoot(homeDir) { return path.join(getLegacyExtensionBaseDir(homeDir), 'WorkBuddyExtension', 'Data'); }
function getWorkbuddyConfigDir(configDir, homeDir = os.homedir()) { return configDir || process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(homeDir, '.workbuddy'); }
function getMcpConfigPath(configDir, homeDir) { return path.join(getWorkbuddyConfigDir(configDir, homeDir), 'mcp.json'); }
function getTargetCredentialsPath(userId, configDir, homeDir) { return path.join(getWorkbuddyConfigDir(configDir, homeDir), 'connectors', userId, '.credentials.json'); }

function getSourceMaxMtime(root = getLegacyExtensionDataRoot()) {
  if (!fs.existsSync(root)) return 0;
  let max = 0;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const filename of LEGACY_OAUTH_FILES) {
        const file = path.join(root, entry.name, filename);
        if (fs.existsSync(file)) max = Math.max(max, fs.statSync(file).mtimeMs);
      }
    }
  } catch {}
  return max;
}

module.exports = Object.freeze({ CUSTOM_MCP_PREFIX, LEGACY_OAUTH_FILES, McpOAuthMigrationService, computeRemainingExpiresIn, generateLegacyKey, getLegacyExtensionBaseDir, getLegacyExtensionDataRoot, getWorkbuddyConfigDir, getMcpConfigPath, getTargetCredentialsPath, getSourceMaxMtime });
