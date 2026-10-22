'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const FORBIDDEN_PRINCIPALS = Object.freeze(['Everyone', 'Authenticated Users', 'BUILTIN\\Users', 'BUILTIN\\Guests', 'Users', 'Guests']);
const isWindows = os.platform() === 'win32';
const enforcedCache = new Map();
const verifyCache = new Map();
const aclStats = { verifyTotal: 0, verifyCacheHit: 0, verifyIcaclsMs: 0, enforceTotal: 0, enforceCacheHit: 0, enforceIcaclsMs: 0 };

function getAclStats() { return { ...aclStats }; }

function enforceFileAcl(filePath) {
  if (isWindows) return enforceWindowsAcl(filePath, false);
  try { fs.chmodSync(filePath, FILE_MODE); } catch (error) { console.warn(`[oauth-acl] enforceFileAcl chmod failed: ${filePath}: ${error}`); }
}

function enforceDirAcl(dirPath) {
  if (isWindows) return enforceWindowsAcl(dirPath, true);
  try { fs.chmodSync(dirPath, DIR_MODE); } catch (error) { console.warn(`[oauth-acl] enforceDirAcl chmod failed: ${dirPath}: ${error}`); }
}

function verifyFileAcl(filePath) { return isWindows ? verifyWindowsAcl(filePath) : verifyPosixAcl(filePath, false); }
function verifyDirAcl(dirPath) { return isWindows ? verifyWindowsAcl(dirPath) : verifyPosixAcl(dirPath, true); }

function tryRepairAcl(targetPath, type) {
  try { type === 'file' ? enforceFileAcl(targetPath) : enforceDirAcl(targetPath); return true; } catch { return false; }
}

function verifyPosixAcl(targetPath, isDir) {
  let stat;
  try { stat = fs.statSync(targetPath); } catch (error) { return { ok: false, reason: 'stat-failed', recoverable: false, detail: `stat failed: ${error}` }; }
  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) return { ok: false, reason: 'mode-too-permissive', recoverable: true, detail: `mode=${mode.toString(8)}, expected ${(isDir ? DIR_MODE : FILE_MODE).toString(8)}` };
  const currentUid = os.userInfo().uid;
  if (typeof currentUid === 'number' && currentUid >= 0 && stat.uid !== currentUid) return { ok: false, reason: 'wrong-owner', recoverable: false, detail: `file uid=${stat.uid}, current uid=${currentUid}` };
  return { ok: true };
}

function getWindowsCurrentUser() { const username = os.userInfo().username; return process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${username}` : username; }
function runIcacls(args) { return childProcess.execFileSync('icacls', args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }).toString('utf8'); }

function enforceWindowsAcl(targetPath, isDir) {
  aclStats.enforceTotal += 1;
  let mtime;
  try { mtime = fs.statSync(targetPath).mtimeMs; } catch { return; }
  if (enforcedCache.get(targetPath) === mtime) { aclStats.enforceCacheHit += 1; return; }
  const startedAt = Date.now();
  try {
    const user = getWindowsCurrentUser();
    runIcacls([targetPath, '/inheritance:r']);
    runIcacls([targetPath, '/grant:r', `${user}:${isDir ? '(OI)(CI)(F)' : '(R,W)'}`]);
    runIcacls([targetPath, '/grant:r', `SYSTEM:${isDir ? '(OI)(CI)(F)' : '(F)'}`]);
    const after = fs.statSync(targetPath).mtimeMs;
    enforcedCache.set(targetPath, after);
    verifyCache.set(targetPath, { mtime: after, ok: true });
  } catch (error) { console.warn(`[oauth-acl] enforceWindowsAcl failed: ${targetPath}: ${error}`); }
  finally { aclStats.enforceIcaclsMs += Date.now() - startedAt; }
}

function verifyWindowsAcl(targetPath) {
  aclStats.verifyTotal += 1;
  let mtime;
  try { mtime = fs.statSync(targetPath).mtimeMs; } catch { return { ok: false, reason: 'stat-failed', recoverable: false, detail: 'stat failed in verify' }; }
  const cached = verifyCache.get(targetPath);
  if (cached?.mtime === mtime) { aclStats.verifyCacheHit += 1; return cached.ok ? { ok: true } : { ok: false, reason: 'broad-principal', recoverable: true }; }
  const startedAt = Date.now();
  let output;
  try { output = runIcacls([targetPath]); }
  catch (error) {
    const message = String(error);
    if (/ENOENT|not recognized|cannot find/i.test(message)) return { ok: true, reason: 'icacls-unavailable', recoverable: false, detail: message };
    return { ok: false, reason: 'icacls-parse-failed', recoverable: true, detail: message };
  } finally { aclStats.verifyIcaclsMs += Date.now() - startedAt; }
  const principals = parseIcaclsPrincipals(output);
  if (!principals.length) return { ok: true, reason: 'icacls-parse-failed', recoverable: false, detail: 'no principals parsed; possibly non-English locale' };
  const broad = principals.find(isBroadPrincipal);
  verifyCache.set(targetPath, { mtime, ok: !broad });
  return broad ? { ok: false, reason: 'broad-principal', recoverable: true, detail: `unexpected principal in ACL: ${broad}` } : { ok: true };
}

function parseIcaclsPrincipals(output) {
  const principals = [];
  for (const rawLine of String(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('Successfully') || line.startsWith('Failed')) continue;
    const match = line.match(/^([^:]+):(\([^)]*\))/);
    if (match) principals.push(match[1].trim());
  }
  return principals;
}

function isBroadPrincipal(principal) {
  const upper = String(principal).toUpperCase();
  return FORBIDDEN_PRINCIPALS.some((value) => upper === value.toUpperCase() || upper.endsWith(`\\${value.toUpperCase()}`));
}

module.exports = Object.freeze({ FILE_MODE, DIR_MODE, FORBIDDEN_PRINCIPALS, getAclStats, enforceFileAcl, enforceDirAcl, verifyFileAcl, verifyDirAcl, tryRepairAcl, verifyPosixAcl, enforceWindowsAcl, verifyWindowsAcl, parseIcaclsPrincipals, isBroadPrincipal });
