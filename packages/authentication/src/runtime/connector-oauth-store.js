'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readOAuthV3, writeOAuthV3 } = require('./oauth-persistence');

const LEGACY_FILE_NAME = '.credentials.json';
const V3_FILE_NAME = '.credentials.v3.json';

class ConnectorOAuthStore {
  constructor(userId, options = {}) {
    this.userId = userId || 'default';
    const homeDir = options.homeDir ?? os.homedir();
    this.storageDir = path.join(homeDir, '.workbuddy', 'connectors', this.userId);
    this.legacyPath = path.join(this.storageDir, LEGACY_FILE_NAME);
    this.v3Path = path.join(this.storageDir, V3_FILE_NAME);
    this.v3Paths = { storageDir: this.storageDir, v3Path: this.v3Path, masterKeyBackupBaseDir: options.backupBaseDir ?? (options.homeDir ? path.join(options.homeDir, '.workbuddy-key-fallback') : undefined) };
  }

  generateServerKey(configId, serverUrl, headers, type) {
    const configString = JSON.stringify({ type: type || 'http', url: serverUrl, Headers: headers });
    return `${this.stripConfigIdPrefix(configId)}|${crypto.createHash('sha256').update(configString).digest('hex').slice(0, 16)}`;
  }

  generateLegacyServerKey(configId, serverUrl) {
    const configString = JSON.stringify({ type: 'http', url: serverUrl });
    return `${this.stripConfigIdPrefix(configId)}|${crypto.createHash('sha256').update(configString).digest('hex').slice(0, 16)}`;
  }

  read() {
    if (this.userId === 'default') return null;
    if (fs.existsSync(this.v3Path)) {
      const result = readOAuthV3({ userId: this.userId, paths: this.v3Paths });
      if (result !== undefined) { this.purgeLegacyIfPresent(); return result; }
      return null;
    }
    const legacy = this.readLegacyPlain();
    if (legacy && (legacy.mcpOAuth || legacy.mcpClientInfo) && writeOAuthV3({ userId: this.userId, paths: this.v3Paths }, legacy)) this.purgeLegacyIfPresent();
    return legacy;
  }

  write(data) {
    if (this.userId === 'default') return false;
    return writeOAuthV3({ userId: this.userId, paths: this.v3Paths }, data);
  }

  readLegacyPlain() {
    try { return fs.existsSync(this.legacyPath) ? JSON.parse(fs.readFileSync(this.legacyPath, 'utf8')) : null; } catch { return null; }
  }

  purgeLegacyIfPresent() { try { if (fs.existsSync(this.legacyPath)) fs.unlinkSync(this.legacyPath); } catch {} }

  saveTokens(configId, serverUrl, tokens, headers) {
    const data = this.read() || {};
    const serverKey = this.generateServerKey(configId, serverUrl, headers);
    const previous = data.mcpOAuth?.[serverKey];
    const expiresAt = tokens.expires_in !== undefined ? Date.now() + tokens.expires_in * 1000 : previous?.expiresAt ?? Date.now();
    data.mcpOAuth = data.mcpOAuth || {};
    data.mcpOAuth[serverKey] = { serverName: this.stripConfigIdPrefix(configId), serverUrl, accessToken: tokens.access_token, tokenType: tokens.token_type, idToken: tokens.id_token ?? previous?.idToken, refreshToken: tokens.refresh_token ?? previous?.refreshToken, expiresAt, scope: tokens.scope };
    return this.write(data);
  }

  loadTokens(configId, serverUrl, headers) {
    const data = this.read();
    if (!data?.mcpOAuth) return undefined;
    const serverKey = this.generateServerKey(configId, serverUrl, headers);
    let info = data.mcpOAuth[serverKey];
    if (!this.isLoadableTokenInfo(info)) {
      const legacyKey = this.generateLegacyServerKey(configId, serverUrl);
      info = data.mcpOAuth[legacyKey];
      if (this.isLoadableTokenInfo(info)) { data.mcpOAuth[serverKey] = { ...info, serverName: this.stripConfigIdPrefix(configId) }; this.write(data); }
    }
    if (!this.isLoadableTokenInfo(info)) return undefined;
    return { access_token: info.accessToken, token_type: info.tokenType, id_token: info.idToken, refresh_token: info.refreshToken, expires_in: Math.max(0, Math.floor((info.expiresAt - Date.now()) / 1000)), scope: info.scope };
  }

  peekTokens(configId, serverUrl, headers) {
    if (this.userId === 'default' || !fs.existsSync(this.v3Path)) return undefined;
    const data = readOAuthV3({ userId: this.userId, paths: this.v3Paths });
    const info = data?.mcpOAuth?.[this.generateServerKey(configId, serverUrl, headers)];
    if (!info?.accessToken || info.expiresAt <= Date.now()) return undefined;
    return { access_token: info.accessToken, token_type: info.tokenType, id_token: info.idToken, refresh_token: info.refreshToken, expires_in: Math.floor((info.expiresAt - Date.now()) / 1000), scope: info.scope };
  }

  saveClientInfo(configId, serverUrl, clientInfo, headers) { const data = this.read() || {}; data.mcpClientInfo = data.mcpClientInfo || {}; data.mcpClientInfo[this.generateServerKey(configId, serverUrl, headers)] = clientInfo; return this.write(data); }
  loadClientInfo(configId, serverUrl, headers) { return this.read()?.mcpClientInfo?.[this.generateServerKey(configId, serverUrl, headers)]; }
  isLoadableTokenInfo(info) { return Boolean(info?.accessToken || (info?.accessTokenRecoverable && info.refreshToken)); }
  stripConfigIdPrefix(configId) { const index = String(configId).lastIndexOf(':'); return index >= 0 ? String(configId).slice(index + 1) : String(configId); }
}

module.exports = Object.freeze({ ConnectorOAuthStore, LEGACY_FILE_NAME, V3_FILE_NAME });
