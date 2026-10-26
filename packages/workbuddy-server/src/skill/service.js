'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPersonalSkillHandlers } = require('./personal/handlers');
const { createSkillHubSkillHandlers } = require('./marketplace/skillhub');
const { createKnotSkillHandlers } = require('./marketplace/knot');
const { createBuiltinMarketSkillHandlers } = require('./marketplace/builtin-market');
const { createLocalMarketplaceSkillHandlers } = require('./marketplace/local-marketplace');
const { BUILTIN_MARKET_BASE_URL_ENV, resolveWorkbuddyConfigDir } = require('./service-shared');

function markSkillUserModified(userSkillsDir, skillName) {
  if (typeof skillName !== 'string' || !skillName.trim() || !fs.existsSync(userSkillsDir)) return { updated: 0 };
  const target = skillName.trim(); let updated = 0;
  for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(userSkillsDir, entry.name); let frontmatterName;
    try { const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'); frontmatterName = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1]?.match(/(?:^|\r?\n)\s*name\s*:\s*(.+?)(?:\r?\n|$)/)?.[1]?.replace(/^['"]|['"]$/g, '').trim(); } catch {}
    for (const file of ['_skillhub_meta.json', '_knot_meta.json', '_builtin_market_meta.json', '_marketplace_meta.json']) {
      const metaPath = path.join(dir, file); if (!fs.existsSync(metaPath)) continue;
      try { const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); const candidates = [meta.name, meta.skillName, meta.slug, entry.name, frontmatterName]; if (candidates.includes(target)) { meta.userModified = true; fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`); updated += 1; } } catch {}
    }
  }
  return { updated };
}

function migrateBuiltinMarketDirsToSkillId(userSkillsDir) {
  if (!fs.existsSync(userSkillsDir)) return { migrated: 0, skipped: 0, failed: 0, alreadyDone: false };
  const marker = path.join(userSkillsDir, '_bm_skillid_migration.json');
  try { if (JSON.parse(fs.readFileSync(marker, 'utf8')).version >= 2) return { migrated: 0, skipped: 0, failed: 0, alreadyDone: true }; } catch {}
  let migrated = 0; let skipped = 0; let failed = 0;
  try {
    for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceDir = path.join(userSkillsDir, entry.name); const metaPath = path.join(sourceDir, '_skillhub_meta.json');
      let meta; try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { continue; }
      if (meta?.source !== 'marketplace') continue;
      const targetName = typeof meta.skillName === 'string' && meta.skillName.trim() ? meta.skillName.trim() : typeof meta.skillId === 'string' && meta.skillId.trim() ? meta.skillId.trim() : '';
      if (!targetName || targetName === entry.name) { skipped += 1; continue; }
      const targetDir = path.join(userSkillsDir, targetName);
      try { if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true }); fs.renameSync(sourceDir, targetDir); migrated += 1; } catch { failed += 1; }
    }
  } catch { failed += 1; }
  try { fs.writeFileSync(marker, JSON.stringify({ migratedAt: Date.now(), version: 2 }, null, 2)); } catch {}
  return { migrated, skipped, failed, alreadyDone: false };
}

function createSkillsService(options = {}) {
  const configDir = resolveWorkbuddyConfigDir(options.configDir);
  const userSkillsDir = options.skillsDir || path.join(configDir, 'skills');
  const marketplaceDir = options.marketplaceDir || path.join(configDir, 'skills-marketplace');
  const tempDir = options.tempDir || os.tmpdir();
  const fetchFn = options.fetchFn || globalThis.fetch;
  const ensureMarketplaceReady = async () => { try { await options.marketplaceUpdater?.waitForReady?.(); } catch {} };
  let activeInstalls = 0; const waiters = [];
  async function enqueueInstall(task) {
    if (activeInstalls >= 2) await new Promise((resolve) => waiters.push(resolve));
    activeInstalls += 1;
    try { return await task(); } finally { activeInstalls -= 1; waiters.shift()?.(); }
  }
  const resolveBuiltinMarketBaseUrl = async () => { const value = process.env[BUILTIN_MARKET_BASE_URL_ENV]?.trim() || await options.getBuiltinMarketEndpoint?.(); return value ? String(value).replace(/\/+$/, '') : ''; };
  const resolveBuiltinMarketHeaders = async () => ({ 'Content-Type': 'application/json', ...(await options.getBuiltinMarketAuthHeaders?.() || {}) });
  const resolveKnotUsername = async () => { try { return await options.getKnotUsername?.(); } catch { return undefined; } };
  const personal = createPersonalSkillHandlers({ configDir, userSkillsDir, marketplaceDir, builtinSkillsDir: options.builtinSkillsDir, securityClient: options.securityClient, reporter: options.reporter });
  const skillHub = createSkillHubSkillHandlers({ fetchFn, tempDir, userSkillsDir, getApiKey: options.getSkillHubApiKey });
  const knot = createKnotSkillHandlers({ fetchFn, tempDir, userSkillsDir, resolveKnotUsername });
  const builtin = createBuiltinMarketSkillHandlers({ fetchFn, tempDir, userSkillsDir, resolveBuiltinMarketBaseUrl, resolveBuiltinMarketHeaders, enqueueInstall, getEnterpriseId: options.getEnterpriseId });
  const local = createLocalMarketplaceSkillHandlers({ marketplaceDir, userSkillsDir, ensureMarketplaceReady, enqueueInstall });
  return {
    ...personal, ...skillHub, ...knot, ...builtin, ...local,
    markSkillUserModified: async (params = {}) => markSkillUserModified(userSkillsDir, params.skillName),
    migrateBuiltinMarketDirsToSkillId: async () => migrateBuiltinMarketDirsToSkillId(userSkillsDir),
  };
}

module.exports = Object.freeze({ createSkillsService, markSkillUserModified });
