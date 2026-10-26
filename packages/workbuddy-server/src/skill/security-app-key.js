'use strict';
const fs = require('node:fs');
function resolveWorkbuddySkillSecurityAppKey(options) { try { const productPath = options.requireBundledAsset('cli', 'product.json'); const text = options.readTextFile ?? ((filePath) => fs.readFileSync(filePath, 'utf8')); const key = JSON.parse(text(productPath)).config?.skillSecurityAppKey; return typeof key === 'string' && key.length > 0 ? key : undefined; } catch { return undefined; } }
function createWorkbuddySkillSecurityAppKeyResolver(options) { let resolved = false; let cached; return () => { if (!resolved) { cached = resolveWorkbuddySkillSecurityAppKey(options); resolved = true; } return cached; }; }
module.exports = Object.freeze({ resolveWorkbuddySkillSecurityAppKey, createWorkbuddySkillSecurityAppKeyResolver });
