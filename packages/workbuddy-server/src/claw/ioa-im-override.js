'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let cache;
function getOverrideFilePath() { return path.join(process.env.WORKBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'), 'ioa-im-override.json'); }
function readIOAImOverride() { const filePath = getOverrideFilePath(); try { const stat = fs.statSync(filePath); if (cache?.mtimeMs === stat.mtimeMs) return cache.value; const value = JSON.parse(fs.readFileSync(filePath, 'utf8')).allowNonTencentIM === true; cache = { mtimeMs: stat.mtimeMs, value }; return value; } catch { cache = undefined; return false; } }
module.exports = { getOverrideFilePath, readIOAImOverride };
