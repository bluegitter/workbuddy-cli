'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { FRONTMATTER_RE } = require('../common/skill-upload-metadata');
const { runSkillPreCheck } = require('../security/skill-scan-helpers');

const TAG = '[SkillsService]';

function parseFrontmatter(content) {
  const match = FRONTMATTER_RE.exec(String(content));
  if (!match) return { data: {}, body: String(content) };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!item) continue;
    let value = item[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value === 'true' || value === 'false') data[item[1]] = value === 'true';
    else if (value.startsWith('[') && value.endsWith(']')) data[item[1]] = value.slice(1, -1).split(',').map((part) => part.trim()).filter(Boolean);
    else data[item[1]] = value;
  }
  return { data, body: String(content).slice(match[0].length).replace(/^\r?\n/, '') };
}

function stringifyFrontmatter(data, body) {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(', ')}]` : typeof value === 'string' && /[:#]/.test(value) ? JSON.stringify(value) : String(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${String(body).trimStart()}`;
}

function patchDisableFlag(content, disable) {
  const match = FRONTMATTER_RE.exec(String(content));
  const line = `disable: ${disable ? 'true' : 'false'}`;
  if (!match) return `---\n${line}\n---\n\n${String(content).replace(/^\r?\n/, '')}`;
  const block = match[1];
  const next = /^disable\s*:.*$/im.test(block) ? block.replace(/^disable\s*:.*$/im, line) : `${block.trimEnd()}\n${line}`;
  return `${String(content).slice(0, match.index)}---\n${next}\n---${String(content).slice(match.index + match[0].length)}`;
}

function readMeta(skillDir) {
  for (const file of ['_skillhub_meta.json', '_marketplace_meta.json', '_user_meta.json']) {
    const filePath = path.join(skillDir, file);
    if (!fs.existsSync(filePath)) continue;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
  }
  return null;
}

function mapSource(source) { return source === 'builtin' ? 'builtin' : source === 'project' ? 'project' : source === 'connector' ? 'connector' : source; }

async function parseSkillFile(filePath, source) {
  const raw = await fsp.readFile(filePath, 'utf8');
  const skillDir = path.dirname(filePath);
  const directoryName = path.basename(skillDir);
  const { data, body } = parseFrontmatter(raw);
  const meta = readMeta(skillDir) || {};
  const name = meta.name || data.name || directoryName;
  const description = meta.description || data.description || body.trim().slice(0, 100) || directoryName;
  return {
    name,
    filePath,
    description,
    description_zh: meta.description_zh || data.description_zh,
    description_en: meta.description_en || data.description_en,
    source: mapSource(source),
    type: 'prompt',
    disable: typeof data.disable === 'boolean' ? data.disable : false,
    slug: meta.slug || directoryName,
    skillId: meta.skillId,
    version: meta.version,
    installedAt: meta.installedAt,
    iconSource: directoryName,
    iconUrl: meta.iconSource?.startsWith('http') ? meta.iconSource : undefined,
    marketplaceSource: ['skillhub', 'marketplace', 'knot'].includes(meta.source) ? meta.source : undefined,
    userModified: meta.userModified === true ? true : undefined,
    labels: meta.labels,
  };
}

async function scanSkillsDirectory(baseDir, source, results, loadedPaths, loadedNames, depth = 0) {
  if (!baseDir || depth > 5) return;
  let entries;
  try { entries = await fsp.readdir(baseDir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    let isDirectory = entry.isDirectory();
    if (!isDirectory && entry.isSymbolicLink()) try { isDirectory = (await fsp.stat(path.join(baseDir, entry.name))).isDirectory(); } catch { continue; }
    if (!isDirectory) continue;
    const skillDir = path.join(baseDir, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!loadedPaths.has(skillFile) && fs.existsSync(skillFile)) {
      try {
        const skill = await parseSkillFile(skillFile, source);
        if (!loadedNames.has(skill.name)) { results.push(skill); loadedPaths.add(skillFile); loadedNames.add(skill.name); }
      } catch (error) { console.warn(`${TAG} failed to parse ${skillFile}:`, String(error)); }
    }
    await scanSkillsDirectory(skillDir, source, results, loadedPaths, loadedNames, depth + 1);
  }
}

function resolveLocalIconPath(iconsDir, iconSource) {
  if (!iconSource) return undefined;
  for (const extension of ['.svg', '.png']) {
    const iconPath = path.join(iconsDir, `${iconSource}${extension}`);
    if (fs.existsSync(iconPath)) return process.platform === 'win32' ? `local-file:///${iconPath.replace(/\\/g, '/')}` : `local-file://${iconPath}`;
  }
  return undefined;
}

function readLocalMarketplaceManifest(marketplaceDir) {
  for (const file of [path.join(marketplaceDir, 'marketplace.json'), path.join(marketplaceDir, '.codebuddy-skill', 'marketplace.json')]) {
    if (!fs.existsSync(file)) continue;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }
  return null;
}

function createPersonalSkillHandlers(ctx = {}) {
  const { configDir, userSkillsDir, marketplaceDir, builtinSkillsDir, securityClient } = ctx;
  return {
    deleteSkill: async (params = {}) => {
      try {
        await fsp.rm(path.dirname(params.filePath), { recursive: true, force: true });
        ctx.reporter?.addCounter?.('wb.skill.delete', 1, { filepath: params.filePath, asset_type: params.assetType ?? 'local', outcome: 'success' });
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    getSkillContent: async (params = {}) => {
      try {
        let content = await fsp.readFile(params.filePath, 'utf8');
        if (builtinSkillsDir && params.filePath.startsWith(builtinSkillsDir)) content = content.replace(/CodeBuddy/g, 'WorkBuddy').replace(/\.codebuddy/g, '.workbuddy').replace(/codebuddy/g, 'workbuddy');
        return { content };
      } catch (error) { return { content: '', error: error instanceof Error ? error.message : String(error) }; }
    },
    toggleSkill: async (params = {}) => {
      const startedAt = Date.now();
      try {
        const raw = await fsp.readFile(params.filePath, 'utf8');
        let next;
        try { const parsed = parseFrontmatter(raw); parsed.data.disable = Boolean(params.disable); next = stringifyFrontmatter(parsed.data, parsed.body); }
        catch { next = patchDisableFlag(raw, params.disable); }
        await fsp.writeFile(params.filePath, next, 'utf8');
        ctx.reporter?.addCounter?.('wb.skill.toggle', 1, { filepath: params.filePath, operation: params.disable ? 'disable' : 'enable', outcome: 'success' });
        ctx.reporter?.recordDuration?.('wb.skill.toggle.duration', Date.now() - startedAt, { outcome: 'success' });
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    getSkillList: async (params = {}) => {
      const results = [];
      const loadedPaths = new Set();
      const loadedNames = new Set();
      try {
        if (params.cwd) await scanSkillsDirectory(path.join(params.cwd, process.env.WORKBUDDY_DATA_FOLDER_NAME?.trim() || '.workbuddy', 'skills'), 'project', results, loadedPaths, loadedNames);
        await scanSkillsDirectory(userSkillsDir, 'userSettings', results, loadedPaths, loadedNames);
        await scanSkillsDirectory(path.join(configDir, 'connectors', 'skills'), 'connector', results, loadedPaths, loadedNames);
        if (builtinSkillsDir) await scanSkillsDirectory(builtinSkillsDir, 'builtin', results, loadedPaths, loadedNames);
        const manifest = readLocalMarketplaceManifest(marketplaceDir);
        const names = new Map((manifest?.skills ?? []).filter((skill) => skill.name).map((skill) => [skill.source || skill.name, skill.name]));
        for (const skill of results) if (skill.marketplaceSource && names.has(skill.iconSource)) skill.name = names.get(skill.iconSource);
        const iconsDir = path.join(marketplaceDir, 'icons');
        for (const skill of results) if (!skill.iconUrl) skill.iconUrl = resolveLocalIconPath(iconsDir, skill.iconSource);
        return { results };
      } catch (error) { return { results: [], error: error instanceof Error ? error.message : String(error) }; }
    },
    installSkillByPath: async (params = {}) => {
      try {
        if (!(await fsp.stat(params.folderPath)).isDirectory()) return { success: false, error: 'Source must be a directory' };
        const skillFile = path.join(params.folderPath, 'SKILL.md');
        await fsp.access(skillFile);
        let preCheck;
        if (params.securityCheck && securityClient) preCheck = await runSkillPreCheck(params.scanSourcePath || params.folderPath, securityClient, { appKey: params.appKey });
        if (preCheck?.scanResult && preCheck.scanResult.verdict !== 'white') return { success: false, error: 'security_check_blocked', preCheck };
        const { data } = parseFrontmatter(await fsp.readFile(skillFile, 'utf8'));
        const skillName = data.name || path.basename(params.folderPath);
        const targetDir = path.join(userSkillsDir, skillName);
        if (fs.existsSync(targetDir) && !params.overwrite) return { success: false, skillName, error: `Skill "${skillName}" already exists`, preCheck };
        await fsp.rm(targetDir, { recursive: true, force: true });
        await fsp.cp(params.folderPath, targetDir, { recursive: true });
        await fsp.writeFile(path.join(targetDir, '_user_meta.json'), JSON.stringify({ name: skillName, installedAt: Date.now(), source: 'userImport' }, null, 2));
        return { success: true, skillName, preCheck };
      } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
    },
  };
}

module.exports = Object.freeze({ createPersonalSkillHandlers, parseFrontmatter, stringifyFrontmatter, scanSkillsDirectory, resolveLocalIconPath, readLocalMarketplaceManifest });
