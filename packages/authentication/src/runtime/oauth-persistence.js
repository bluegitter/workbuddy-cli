'use strict';

const fs = require('fs');
const {
  OAuthCipher,
  createHeader,
  isCipherEnvelope,
} = require('./oauth-cipher');
const { ConnectorOAuthMasterKeyStore } = require('./connector-master-key-store');

const FILE_MODE = 0o600;

function readOAuthV3(options) {
  const { paths, userId } = options;
  if (!fs.existsSync(paths.v3Path)) return undefined;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(paths.v3Path, 'utf8')); } catch { return undefined; }
  if (raw?.version !== 3 || !raw.encryption) return undefined;
  const cipher = buildCipherForRead(userId, raw.encryption, paths);
  if (!cipher) return undefined;
  const result = {};
  if (raw.mcpOAuth) {
    result.mcpOAuth = {};
    for (const [key, value] of Object.entries(raw.mcpOAuth)) {
      const info = tryDecryptOAuthInfo(value, key, cipher);
      if (info) result.mcpOAuth[key] = info;
    }
  }
  if (raw.mcpClientInfo) {
    result.mcpClientInfo = {};
    for (const [key, value] of Object.entries(raw.mcpClientInfo)) {
      const info = tryDecryptClientInfo(value, key, cipher);
      if (info) result.mcpClientInfo[key] = info;
    }
  }
  return result;
}

function writeOAuthV3(options, data) {
  const { paths, userId } = options;
  try {
    fs.mkdirSync(paths.storageDir, { recursive: true, mode: 0o700 });
    const built = buildCipherForWrite(userId, paths);
    if (!built) return false;
    const persisted = { version: 3, encryption: built.header };
    if (data?.mcpOAuth) persisted.mcpOAuth = Object.fromEntries(Object.entries(data.mcpOAuth).map(([key, info]) => [key, encryptOAuthInfo(info, key, built.cipher)]));
    if (data?.mcpClientInfo) persisted.mcpClientInfo = Object.fromEntries(Object.entries(data.mcpClientInfo).map(([key, info]) => [key, encryptClientInfo(info, key, built.cipher)]));
    atomicWriteFile(paths.v3Path, JSON.stringify(persisted, null, 2));
    return true;
  } catch (error) { options.logger?.warn?.(`[oauth-persistence] write failed: ${error?.message || error}`); return false; }
}

function encryptOAuthInfo(info, serverKey, cipher) {
  return {
    serverName: info.serverName,
    serverUrl: info.serverUrl,
    tokenType: info.tokenType,
    expiresAt: info.expiresAt,
    scope: info.scope,
    accessToken: cipher.encrypt(info.accessToken, { serverKey, fieldName: 'accessToken' }),
    accessTokenRecoverable: info.accessTokenRecoverable || undefined,
    refreshToken: info.refreshToken !== undefined ? cipher.encrypt(info.refreshToken, { serverKey, fieldName: 'refreshToken' }) : undefined,
    idToken: info.idToken !== undefined ? cipher.encrypt(info.idToken, { serverKey, fieldName: 'idToken' }) : undefined,
  };
}

function encryptClientInfo(info, serverKey, cipher) {
  return { client_id: info.client_id, redirect_uris: info.redirect_uris, client_secret: info.client_secret !== undefined ? cipher.encrypt(info.client_secret, { serverKey, fieldName: 'client_secret' }) : undefined };
}

function tryDecryptOAuthInfo(persisted, serverKey, cipher) {
  const accessToken = safeDecryptField(persisted?.accessToken, serverKey, 'accessToken', cipher);
  const refreshToken = safeDecryptField(persisted?.refreshToken, serverKey, 'refreshToken', cipher);
  const idToken = safeDecryptField(persisted?.idToken, serverKey, 'idToken', cipher);
  const accessTokenRecoverable = accessToken === undefined && Boolean(refreshToken);
  if (accessToken === undefined && !refreshToken) return undefined;
  return {
    serverName: persisted.serverName,
    serverUrl: persisted.serverUrl,
    tokenType: persisted.tokenType,
    expiresAt: accessTokenRecoverable ? 0 : persisted.expiresAt,
    scope: persisted.scope,
    accessToken: accessToken ?? '',
    refreshToken,
    idToken,
    accessTokenRecoverable: accessTokenRecoverable ? true : undefined,
  };
}

function tryDecryptClientInfo(persisted, serverKey, cipher) {
  try {
    return { client_id: persisted.client_id, redirect_uris: persisted.redirect_uris, client_secret: decryptField(persisted.client_secret, serverKey, 'client_secret', cipher) };
  } catch { return undefined; }
}

function safeDecryptField(value, serverKey, fieldName, cipher) { try { return decryptField(value, serverKey, fieldName, cipher); } catch { return undefined; } }
function decryptField(value, serverKey, fieldName, cipher) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (isCipherEnvelope(value)) return cipher.decrypt(value, { serverKey, fieldName });
  return undefined;
}

function buildCipherForRead(userId, header, paths) {
  const masterKey = new ConnectorOAuthMasterKeyStore({ userId, primaryDir: paths.storageDir, backupBaseDir: paths.masterKeyBackupBaseDir }).getExisting()?.key;
  if (!masterKey) return undefined;
  try { return new OAuthCipher({ userId, masterKey, header }); } catch { return undefined; }
}

function buildCipherForWrite(userId, paths) {
  const masterKey = new ConnectorOAuthMasterKeyStore({ userId, primaryDir: paths.storageDir, backupBaseDir: paths.masterKeyBackupBaseDir }).getOrCreate()?.key;
  if (!masterKey) return undefined;
  let header;
  try {
    const raw = JSON.parse(fs.readFileSync(paths.v3Path, 'utf8'));
    header = raw?.version === 3 ? raw.encryption : undefined;
  } catch {}
  header ||= createHeader(userId, masterKey);
  try { return { cipher: new OAuthCipher({ userId, masterKey, header }), header }; } catch { return undefined; }
}

function atomicWriteFile(finalPath, content) {
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tempPath, 'wx', FILE_MODE);
  try { fs.writeSync(fd, content); fs.fchmodSync(fd, FILE_MODE); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tempPath, finalPath); fs.chmodSync(finalPath, FILE_MODE); } catch (error) { try { fs.rmSync(tempPath, { force: true }); } catch {} throw error; }
}

module.exports = Object.freeze({ readOAuthV3, writeOAuthV3, encryptOAuthInfo, encryptClientInfo, tryDecryptOAuthInfo, tryDecryptClientInfo, safeDecryptField, decryptField, atomicWriteFile });
