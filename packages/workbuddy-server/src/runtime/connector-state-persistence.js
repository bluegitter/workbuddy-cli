'use strict';

const fs = require('fs');
const path = require('path');
const {
  OAuthCipher,
  ConnectorOAuthMasterKeyStore,
  createHeader,
  isCipherEnvelope,
} = require('../../../authentication/src');
const {
  FILE_MODE,
  AAD_SCOPE_HEADER,
  AAD_SCOPE_ENV,
  resolveStatesFilePaths,
  isAnonymousUser,
  extractNonSensitiveFields,
  coercePlainMap,
} = require('./connector-state-utils');

function readStates(options) {
  const { paths, userId } = options;
  if (isAnonymousUser(userId)) return undefined;
  if (fs.existsSync(paths.v3Path)) {
    const value = readV3(options);
    if (value !== undefined) purgeLegacyIfPresent(paths.legacyPath);
    return value;
  }
  const legacy = readLegacyPlain(paths.legacyPath);
  if (legacy && writeV3(options, legacy)) purgeLegacyIfPresent(paths.legacyPath);
  return legacy;
}

function writeStates(options, state) {
  if (isAnonymousUser(options.userId)) return false;
  return writeV3(options, state);
}

function readV3(options) {
  const { paths, userId } = options;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(paths.v3Path, 'utf8')); } catch { return undefined; }
  if (raw?.version !== 3 || !raw.encryption) return undefined;
  const cipher = buildCipherForRead(userId, raw.encryption, paths, options);
  if (!cipher) return undefined;
  return {
    ...extractNonSensitiveFields(raw),
    headerOverrides: decryptSensitiveMap(raw.headerOverrides, AAD_SCOPE_HEADER, cipher),
    envOverrides: decryptSensitiveMap(raw.envOverrides, AAD_SCOPE_ENV, cipher),
  };
}

function writeV3(options, state) {
  const { paths, userId } = options;
  try {
    ensureStorageDir(paths.storageDir, options);
    const built = buildCipherForWrite(userId, paths, options);
    if (!built) return false;
    const persisted = {
      ...extractNonSensitiveFields(state),
      version: 3,
      encryption: built.header,
      headerOverrides: encryptSensitiveMap(state?.headerOverrides, AAD_SCOPE_HEADER, built.cipher),
      envOverrides: encryptSensitiveMap(state?.envOverrides, AAD_SCOPE_ENV, built.cipher),
    };
    atomicWriteFile(paths.v3Path, JSON.stringify(persisted, null, 2), options);
    return true;
  } catch (error) {
    options.logger?.warn?.(`[states-persistence] writeV3 failed: ${error}`);
    return false;
  }
}

function readLegacyPlain(legacyPath) {
  if (!fs.existsSync(legacyPath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    return { ...extractNonSensitiveFields(raw), headerOverrides: coercePlainMap(raw.headerOverrides), envOverrides: coercePlainMap(raw.envOverrides) };
  } catch { return undefined; }
}

function encryptSensitiveMap(map, scope, cipher) {
  const result = {};
  for (const [configId, fields] of Object.entries(map || {})) {
    if (!fields || typeof fields !== 'object') continue;
    result[configId] = {};
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string') result[configId][key] = cipher.encrypt(value, { serverKey: `${scope}:${configId}`, fieldName: key });
    }
  }
  return result;
}

function decryptSensitiveMap(map, scope, cipher) {
  const result = {};
  for (const [configId, fields] of Object.entries(map || {})) {
    if (!fields || typeof fields !== 'object') continue;
    const plain = {};
    for (const [key, value] of Object.entries(fields)) {
      const decrypted = decryptValue(value, `${scope}:${configId}`, key, cipher);
      if (decrypted !== undefined) plain[key] = decrypted;
    }
    result[configId] = plain;
  }
  return result;
}

function decryptValue(value, serverKey, fieldName, cipher) {
  if (typeof value === 'string') return value;
  if (!isCipherEnvelope(value)) return undefined;
  try { return cipher.decrypt(value, { serverKey, fieldName }); } catch { return undefined; }
}

function purgeLegacyIfPresent(legacyPath) {
  try { if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath); } catch {}
}

function buildCipherForRead(userId, header, paths, options) {
  const masterKey = getMasterKeyStore(userId, paths, options).getExisting()?.key;
  if (!masterKey) return undefined;
  try { return new OAuthCipher({ userId, masterKey, header }); } catch { return undefined; }
}

function buildCipherForWrite(userId, paths, options) {
  const store = getMasterKeyStore(userId, paths, options);
  const masterKey = store.getOrCreate()?.key;
  if (!masterKey) return undefined;
  let header;
  try { header = readExistingHeader(paths.v3Path) || createHeader(userId, masterKey); } catch { return undefined; }
  try { return { cipher: new OAuthCipher({ userId, masterKey, header }), header }; } catch {
    try { const freshHeader = createHeader(userId, masterKey); return { cipher: new OAuthCipher({ userId, masterKey, header: freshHeader }), header: freshHeader }; } catch { return undefined; }
  }
}

function getMasterKeyStore(userId, paths, options) {
  return new ConnectorOAuthMasterKeyStore({ userId, primaryDir: paths.storageDir, backupBaseDir: paths.masterKeyBackupBaseDir || options.masterKeyBackupBaseDir });
}

function readExistingHeader(v3Path) {
  try {
    const raw = JSON.parse(fs.readFileSync(v3Path, 'utf8'));
    return raw?.version === 3 && raw.encryption ? raw.encryption : undefined;
  } catch { return undefined; }
}

function ensureStorageDir(storageDir, options) {
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(storageDir, 0o700); } catch {}
  options.acl?.enforceDir?.(storageDir);
}

function atomicWriteFile(finalPath, content, options) {
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tempPath, 'wx', FILE_MODE);
  try { fs.writeSync(fd, content); fs.fchmodSync(fd, FILE_MODE); } finally { fs.closeSync(fd); }
  try {
    fs.renameSync(tempPath, finalPath);
    try { fs.chmodSync(finalPath, FILE_MODE); } catch {}
    options.acl?.enforceFile?.(finalPath);
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch {}
    throw error;
  }
}

module.exports = Object.freeze({
  readStates,
  writeStates,
  readV3,
  writeV3,
  readLegacyPlain,
  encryptSensitiveMap,
  decryptSensitiveMap,
  decryptValue,
  purgeLegacyIfPresent,
  resolveStatesFilePaths,
});
