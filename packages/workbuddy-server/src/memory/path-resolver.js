'use strict';

const os = require('os');
const path = require('path');

const DEFAULT_WORKBUDDY_DIR_NAME = '.workbuddy';
const MEMORY_DIR_NAME = 'memory';
const LEGACY_MEMORY_DIR_NAME = 'memery';

function getWorkbuddyConfigBaseDir(homeDir = os.homedir()) {
  return process.env.WORKBUDDY_CONFIG_DIR?.trim() || path.join(homeDir, DEFAULT_WORKBUDDY_DIR_NAME);
}

function resolveMemoryDirs(homeDir = os.homedir()) {
  const base = getWorkbuddyConfigBaseDir(homeDir);
  return { primaryDir: path.join(base, MEMORY_DIR_NAME), legacyDir: path.join(base, LEGACY_MEMORY_DIR_NAME) };
}

function sanitizeFilename(input) { return String(input).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim(); }
function buildArchiveFileName(uid, legacy = false) { return `${sanitizeFilename(uid)}_${legacy ? 'memery' : 'memory'}.md`; }
function buildBackupFileName(uid, legacy = false) { return `${buildArchiveFileName(uid, legacy)}.bak`; }

module.exports = { getWorkbuddyConfigBaseDir, resolveMemoryDirs, sanitizeFilename, buildArchiveFileName, buildBackupFileName };
