'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');

const execFileAsync = util.promisify(childProcess.execFile);
const PROTECTED_WINDOW_DAYS = 7;
const REFRESH_INTERVAL_MS = 360 * 60 * 1000;
const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DENY_MASK = '(OI)(CI)(DE,DC)';

let logger = console;

function setLogAclGuardLogger(nextLogger) {
  logger = nextLogger && typeof nextLogger.warn === 'function' ? nextLogger : console;
}

function getUsername() {
  try { return os.userInfo().username; } catch { return ''; }
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

function computeCutoff(today) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (PROTECTED_WINDOW_DAYS - 1));
  return date.toISOString().split('T')[0];
}

async function refreshLogAclGuard(logsDir, options = {}) {
  if (process.platform !== 'win32') return;
  const username = options.username || getUsername();
  if (!username) {
    logger.warn('[LogAclGuard] empty username, skip');
    return;
  }
  let entries;
  try {
    entries = await fs.readdir(logsDir);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') logger.warn(`[LogAclGuard] cannot read logsDir ${logsDir}: ${error}`);
    return;
  }
  const cutoff = computeCutoff(todayStr());
  for (const dir of entries.filter((entry) => DATE_DIR_PATTERN.test(entry))) {
    const dirPath = path.join(logsDir, dir);
    const shouldProtect = dir >= cutoff;
    try {
      if (shouldProtect) await protectDir(dirPath, username);
      else await releaseDir(dirPath, username);
    } catch (error) {
      logger.warn(`[LogAclGuard] ${shouldProtect ? 'protect' : 'release'} ${dir} failed: ${error}`);
    }
  }
}

async function releaseLogAclGuard(dirPath, username) {
  if (process.platform !== 'win32') return;
  const user = username || getUsername();
  if (!user) return;
  try { await releaseDir(dirPath, user); }
  catch (error) { logger.warn(`[LogAclGuard] release ${dirPath} failed (best-effort): ${error}`); }
}

function startLogAclGuardScheduler(logsDir) {
  if (process.platform !== 'win32') return () => {};
  refreshLogAclGuard(logsDir).catch((error) => logger.warn(`[LogAclGuard] initial refresh failed: ${error}`));
  const handle = setInterval(() => {
    refreshLogAclGuard(logsDir).catch((error) => logger.warn(`[LogAclGuard] periodic refresh failed: ${error}`));
  }, REFRESH_INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}

async function protectDir(dirPath, username) {
  await runIcacls(dirPath, ['/remove:d', username]);
  await runIcacls(dirPath, ['/deny', `${username}:${DENY_MASK}`]);
}

async function releaseDir(dirPath, username) {
  await runIcacls(dirPath, ['/remove:d', username]);
}

async function runIcacls(targetPath, extraArgs) {
  return execFileAsync('icacls', [targetPath, ...extraArgs, '/C', '/Q'], { windowsHide: true });
}

module.exports = {
  DATE_DIR_PATTERN,
  DENY_MASK,
  PROTECTED_WINDOW_DAYS,
  REFRESH_INTERVAL_MS,
  computeCutoff,
  refreshLogAclGuard,
  releaseLogAclGuard,
  setLogAclGuardLogger,
  startLogAclGuardScheduler,
};
