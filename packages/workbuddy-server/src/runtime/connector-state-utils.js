'use strict';

const path = require('path');

const FILE_MODE = 0o600;
const STATES_V3_FILE_NAME = 'connector-states.v3.json';
const STATES_LEGACY_FILE_NAME = 'connector-states.json';
const AAD_SCOPE_HEADER = 'connector-states:headerOverrides';
const AAD_SCOPE_ENV = 'connector-states:envOverrides';

function resolveStatesFilePaths(storageDir, masterKeyBackupBaseDir) {
  return {
    storageDir,
    v3Path: path.join(storageDir, STATES_V3_FILE_NAME),
    legacyPath: path.join(storageDir, STATES_LEGACY_FILE_NAME),
    masterKeyBackupBaseDir,
  };
}

function isAnonymousUser(userId) { return !userId || userId === 'default'; }

function coerceStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function coerceOptionalStringArray(value) {
  return Array.isArray(value) ? coerceStringArray(value) : undefined;
}

function coerceConnectorUserDisabledState(value) {
  if (Array.isArray(value)) return value.reduce((result, item) => {
    if (typeof item === 'string') result[item] = true;
    return result;
  }, {});
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'boolean'));
}

function coerceStringArrayMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const values = coerceStringArray(item);
    if (values.length > 0) result[key] = values;
  }
  return result;
}

function coercePlainMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const result = {};
  for (const [configId, fields] of Object.entries(map)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    result[configId] = Object.fromEntries(Object.entries(fields).filter(([, value]) => typeof value === 'string'));
  }
  return result;
}

function extractNonSensitiveFields(source = {}) {
  return {
    enabled: coerceStringArray(source.enabled),
    headerOverridesBearerStripped: source.headerOverridesBearerStripped,
    staleManagedAuthHeadersPurged: source.staleManagedAuthHeadersPurged,
    accountIdentityKey: source.accountIdentityKey,
    everConnected: coerceOptionalStringArray(source.everConnected),
    userDisabled: coerceConnectorUserDisabledState(source.userDisabled),
    disabledToolsOverrides: coerceStringArrayMap(source.disabledToolsOverrides),
    mcpSecurityMigrated: source.mcpSecurityMigrated,
    cSideAutoBoundDefaultDisabledMigrated: source.cSideAutoBoundDefaultDisabledMigrated,
  };
}

function isCipherEnvelope(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.ciphertext === 'string' && typeof value.iv === 'string');
}

module.exports = Object.freeze({
  FILE_MODE,
  STATES_V3_FILE_NAME,
  STATES_LEGACY_FILE_NAME,
  AAD_SCOPE_HEADER,
  AAD_SCOPE_ENV,
  resolveStatesFilePaths,
  isAnonymousUser,
  coerceStringArray,
  coerceOptionalStringArray,
  coerceConnectorUserDisabledState,
  coerceStringArrayMap,
  coercePlainMap,
  extractNonSensitiveFields,
  isCipherEnvelope,
});
