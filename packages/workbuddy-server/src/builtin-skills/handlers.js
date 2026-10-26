'use strict';

const path = require('node:path');
const fs = require('node:fs');

const CHANNEL_GET_PATH = 'builtinSkills:getPath';
const CHANNEL_READ_FILE = 'builtinSkills:readFile';
const READ_FILE_MAX_BYTES = 1024 * 1024;
function isSafeSkillName(value) { return typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9_.-]+$/.test(value) && !value.includes('..'); }
function resolveSafeRelPath(skillRoot, relPath) {
  if (typeof relPath !== 'string' || !relPath || path.isAbsolute(relPath) || /^[A-Za-z]:/.test(relPath)) return null;
  const root = path.resolve(skillRoot); const resolved = path.resolve(root, relPath); const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return resolved === root || resolved.startsWith(prefix) ? resolved : null;
}
function registerBuiltinSkillsHandlers(registry, deps) {
  registry.handle(CHANNEL_GET_PATH, async (skillName) => !isSafeSkillName(skillName) ? null : deps.resolveBundledAsset('builtin-skills', skillName) ?? null);
  registry.handle(CHANNEL_READ_FILE, async (skillName, relPath) => {
    if (!isSafeSkillName(skillName)) return null; const root = deps.resolveBundledAsset('builtin-skills', skillName); const file = root && resolveSafeRelPath(root, relPath); if (!file) return null;
    try { const stat = await fs.promises.stat(file); return stat.isFile() && stat.size <= (deps.maxFileBytes ?? READ_FILE_MAX_BYTES) ? fs.promises.readFile(file, 'utf8') : null; } catch { return null; }
  });
}
module.exports = { CHANNEL_GET_PATH, CHANNEL_READ_FILE, READ_FILE_MAX_BYTES, isSafeSkillName, resolveSafeRelPath, registerBuiltinSkillsHandlers };
