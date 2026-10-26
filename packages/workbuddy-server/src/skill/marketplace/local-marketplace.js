'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function sanitizePathSegment(name) {
  if (!name) return 'skill';
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().replace(/[. ]+$/g, '') || 'skill';
}

function readLocalMarketplaceManifest(marketplaceDir) {
  for (const file of [path.join(marketplaceDir, 'marketplace.json'), path.join(marketplaceDir, '.codebuddy-skill', 'marketplace.json')]) {
    if (!fs.existsSync(file)) continue;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }
  return null;
}

function resolveLocalIconPath(iconsDir, source) {
  for (const extension of ['.svg', '.png']) {
    const file = path.join(iconsDir, `${source}${extension}`);
    if (fs.existsSync(file)) return process.platform === 'win32' ? `local-file:///${file.replace(/\\/g, '/')}` : `local-file://${file}`;
  }
  return undefined;
}

function findMarketplaceSkillDir(marketplaceDir, name) {
  if (!name) return undefined;
  const direct = path.join(marketplaceDir, name);
  if (fs.existsSync(path.join(direct, 'SKILL.md'))) return direct;
  const nested = path.join(marketplaceDir, 'skills', name);
  if (fs.existsSync(path.join(nested, 'SKILL.md'))) return nested;
  return undefined;
}

function scanMarketplaceSkills(marketplaceDir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(marketplaceDir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = findMarketplaceSkillDir(marketplaceDir, entry.name);
    if (!dir) continue;
    const content = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    const description = content.match(/^description\s*:\s*(.+)$/im)?.[1]?.trim() || entry.name;
    results.push({ name: entry.name, source: entry.name, description, filePath: path.join(dir, 'SKILL.md') });
  }
  return results;
}

function findInstalledDirByMeta(userSkillsDir, fileName, source, predicates) {
  let entries;
  try { entries = fs.readdirSync(userSkillsDir, { withFileTypes: true }); } catch { return undefined; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(userSkillsDir, entry.name, fileName);
    if (!fs.existsSync(file)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (meta.source === source && predicates.some((predicate) => predicate(meta))) return entry.name;
    } catch {}
  }
  return undefined;
}

function resolveInstallTargetDirName(userSkillsDir, baseName, source, fileName, metaSource) {
  const normalized = sanitizePathSegment(baseName);
  const candidate = `${normalized}__${source}`;
  if (!fs.existsSync(path.join(userSkillsDir, candidate))) return candidate;
  const old = path.join(userSkillsDir, normalized);
  if (fs.existsSync(path.join(old, fileName))) {
    try { if (JSON.parse(fs.readFileSync(path.join(old, fileName), 'utf8')).source === metaSource) return normalized; } catch {}
  }
  return candidate;
}

async function copyDirectory(source, target) {
  await fsp.cp(source, target, { recursive: true, force: true });
}

function createLocalMarketplaceSkillHandlers(ctx = {}) {
  const { marketplaceDir, userSkillsDir, ensureMarketplaceReady = async () => {}, enqueueInstall = (task) => task() } = ctx;
  return {
    getMarketplaceSkillContent: async (params = {}) => {
      await ensureMarketplaceReady();
      const manifest = readLocalMarketplaceManifest(marketplaceDir);
      const entry = manifest?.skills?.find((item) => item.name === params.skillName);
      const skillDir = findMarketplaceSkillDir(marketplaceDir, entry?.source || params.skillName);
      if (!skillDir) return { content: '', error: `Skill "${params.skillName}" not found in marketplace` };
      try { return { content: await fsp.readFile(path.join(skillDir, 'SKILL.md'), 'utf8') }; }
      catch (error) { return { content: '', error: error instanceof Error ? error.message : String(error) }; }
    },
    getMarketplaceSkills: async () => {
      await ensureMarketplaceReady();
      await fsp.mkdir(marketplaceDir, { recursive: true });
      const iconsDir = path.join(marketplaceDir, 'icons');
      const manifest = readLocalMarketplaceManifest(marketplaceDir);
      const results = manifest?.skills ?? scanMarketplaceSkills(marketplaceDir);
      return {
        results: results.map((item) => ({ ...item, iconUrl: resolveLocalIconPath(iconsDir, item.source) || resolveLocalIconPath(iconsDir, item.name) || item.iconUrl })),
        ...(manifest ? { tagCategories_zh: manifest.tags_zh, tagCategories_en: manifest.tags_en } : {}),
      };
    },
    installMarketplaceSkill: (params = {}) => enqueueInstall(async () => {
      await ensureMarketplaceReady();
      const skillName = params.skillName;
      const manifestEntry = readLocalMarketplaceManifest(marketplaceDir)?.skills?.find((item) => item.name === skillName);
      const source = manifestEntry?.source || skillName;
      const sourceDir = findMarketplaceSkillDir(marketplaceDir, source) || findMarketplaceSkillDir(marketplaceDir, skillName);
      if (!sourceDir) return { success: false, skillName, errorMessage: `Skill "${skillName}" not found in marketplace` };
      const existingDirName = findInstalledDirByMeta(userSkillsDir, '_skillhub_meta.json', 'marketplace', [
        (meta) => meta.name === skillName,
        (meta) => meta.iconSource === source,
      ]);
      const targetDirName = existingDirName || resolveInstallTargetDirName(userSkillsDir, skillName, 'local', '_skillhub_meta.json', 'marketplace');
      const targetDir = path.join(userSkillsDir, targetDirName);
      try {
        await fsp.mkdir(userSkillsDir, { recursive: true });
        let installedAt;
        const existingMeta = path.join(targetDir, '_skillhub_meta.json');
        if (fs.existsSync(existingMeta)) try { installedAt = JSON.parse(fs.readFileSync(existingMeta, 'utf8')).installedAt; } catch {}
        await fsp.rm(targetDir, { recursive: true, force: true });
        await copyDirectory(sourceDir, targetDir);
        await fsp.writeFile(existingMeta, JSON.stringify({ name: skillName, installedAt: installedAt ?? Date.now(), source: 'marketplace', iconSource: manifestEntry?.source, version: manifestEntry?.version }, null, 2));
        return { success: true, skillName };
      } catch (error) { return { success: false, skillName, errorMessage: error instanceof Error ? error.message : String(error) }; }
    }),
  };
}

module.exports = Object.freeze({ createLocalMarketplaceSkillHandlers, findMarketplaceSkillDir, readLocalMarketplaceManifest, resolveLocalIconPath, resolveInstallTargetDirName, sanitizePathSegment });
