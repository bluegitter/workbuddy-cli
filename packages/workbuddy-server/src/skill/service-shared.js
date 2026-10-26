'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const TAG = '[SkillsService]';
const DEFAULT_CONFIG_DIRNAME = '.workbuddy';
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const KNOT_BASE_URL = 'https://knot.woa.com/apigw/api/v1/skills';
const KNOT_USERNAME_ENV = 'WORKBUDDY_KNOT_USERNAME';
const BUILTIN_MARKET_BASE_URL_ENV = 'WORKBUDDY_BUILTIN_MARKET_BASE_URL';
const BUILTIN_MARKET_ROUTE_PREFIX = '/v2/operation-platform/market';
const BUILTIN_MARKET_META_FILE = '_skillhub_meta.json';
const BUILTIN_MARKET_META_SOURCE = 'marketplace';

function resolveWorkbuddyConfigDir(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.WORKBUDDY_CONFIG_DIR?.trim()) return process.env.WORKBUDDY_CONFIG_DIR.trim();
  const suffix = process.env.WORKBUDDY_INSTANCE_NUMBER?.trim() ? `-${process.env.WORKBUDDY_INSTANCE_NUMBER.trim()}` : '';
  return path.join(os.homedir(), `${DEFAULT_CONFIG_DIRNAME}${suffix}`);
}

function parseScalar(value) {
  const text = String(value ?? '').trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  if (text.startsWith('[') && text.endsWith(']')) return text.slice(1, -1).split(',').map((item) => parseScalar(item)).filter((item) => item !== '');
  return text;
}

function parseFrontmatter(content) {
  const match = FRONTMATTER_RE.exec(String(content));
  if (!match) return { data: {}, body: String(content) };
  let data;
  try { data = require('yaml').parse(match[1]) || {}; } catch {
    data = {};
    for (const line of match[1].split(/\r?\n/)) { const item = line.match(/^([\w-]+)\s*:\s*(.*)$/); if (item) data[item[1]] = parseScalar(item[2]); }
  }
  return { data, body: String(content).slice(match[0].length).replace(/^\r?\n/, '') };
}

function stringifyFrontmatter(data, body) {
  let yaml;
  try { yaml = require('yaml').stringify(data).trimEnd(); } catch { yaml = Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(', ')}]` : String(value)}`).join('\n'); }
  return `---\n${yaml}\n---\n\n${String(body).trimStart()}`;
}

function coerceFrontmatterText(value) {
  if (value == null || typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return undefined; }
}

function asSkillFrontmatter(data = {}) {
  return { name: coerceFrontmatterText(data.name), description: coerceFrontmatterText(data.description), description_zh: coerceFrontmatterText(data.description_zh), description_en: coerceFrontmatterText(data.description_en), 'when-to-use': coerceFrontmatterText(data['when-to-use']), 'allowed-tools': data['allowed-tools'], disable: typeof data.disable === 'boolean' ? data.disable : undefined, license: coerceFrontmatterText(data.license), examples_zh: Array.isArray(data.examples_zh) ? data.examples_zh.map(String) : undefined, examples_en: Array.isArray(data.examples_en) ? data.examples_en.map(String) : undefined };
}

async function ensureDir(dir) { if (!fs.existsSync(dir)) await fsp.mkdir(dir, { recursive: true }); }
function normalizeAllowedTools(value) { if (!value) return undefined; return Array.isArray(value) ? value.map(String) : String(value).split(',').map((item) => item.trim()).filter(Boolean); }

function resolveMarketplaceRoot(configDir, marketplace) {
  try { const value = JSON.parse(fs.readFileSync(path.join(configDir, 'plugins', 'known_marketplaces.json'), 'utf8'))?.[marketplace]?.installLocation; return typeof value === 'string' && value ? value : undefined; } catch { return undefined; }
}
function resolvePluginDir(configDir, marketplace, pluginName) {
  const root = resolveMarketplaceRoot(configDir, marketplace) || path.join(configDir, 'plugins', 'marketplaces', marketplace);
  for (const file of [path.join(root, '.codebuddy-plugin', 'marketplace.json'), path.join(root, '.claude-plugin', 'marketplace.json')]) {
    try { const entry = JSON.parse(fs.readFileSync(file, 'utf8')).plugins?.find((item) => item.name === pluginName); if (entry?.source && fs.existsSync(path.join(root, entry.source))) return path.join(root, entry.source); } catch {}
  }
  const fallback = path.join(root, 'plugins', pluginName);
  return fs.existsSync(fallback) ? fallback : undefined;
}

async function scanSkillsDirectory(baseDir, source, results, loadedPaths = new Set(), loadedNames = new Set(), depth = 0) {
  if (!baseDir || depth > 5) return;
  let entries; try { entries = await fsp.readdir(baseDir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    let directory = entry.isDirectory(); if (!directory && entry.isSymbolicLink()) try { directory = (await fsp.stat(path.join(baseDir, entry.name))).isDirectory(); } catch {}
    if (!directory) continue;
    const dir = path.join(baseDir, entry.name); const file = path.join(dir, 'SKILL.md');
    if (!loadedPaths.has(file) && fs.existsSync(file)) try { const skill = await parseSkillFile(file, source); if (skill && !loadedNames.has(skill.name)) { results.push(skill); loadedPaths.add(file); loadedNames.add(skill.name); } } catch (error) { console.warn(`${TAG} failed to parse ${file}:`, String(error)); }
    await scanSkillsDirectory(dir, source, results, loadedPaths, loadedNames, depth + 1);
  }
}

async function scanPluginSkills(configDir, results, loadedPaths, loadedNames) {
  try {
    const enabled = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8')).enabledPlugins || {};
    for (const [id, active] of Object.entries(enabled)) {
      if (!active || !id.includes('@')) continue;
      const [pluginName, marketplace] = id.split('@'); const root = resolvePluginDir(configDir, marketplace, pluginName); if (!root) continue;
      await scanSkillsDirectory(path.join(root, 'skills'), 'user', results, loadedPaths, loadedNames);
      const rootFile = path.join(root, 'SKILL.md'); if (fs.existsSync(rootFile) && !loadedPaths.has(rootFile)) { const skill = await parseSkillFile(rootFile, 'user'); if (skill && !loadedNames.has(skill.name)) { skill.source = 'plugin'; results.push(skill); loadedPaths.add(rootFile); loadedNames.add(skill.name); } }
    }
  } catch (error) { console.warn(`${TAG} plugin scan failed:`, String(error)); }
}

function readInstalledSkillMeta(skillDir) { for (const name of ['_skillhub_meta.json', '_marketplace_meta.json', '_knot_meta.json', '_builtin_market_meta.json', '_user_meta.json']) { try { const file = path.join(skillDir, name); if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } } return null; }
function toLocalFileUrl(absolutePath) { return process.platform === 'win32' ? `local-file:///${absolutePath.replace(/\\/g, '/')}` : `local-file://${absolutePath}`; }
function mapScanSourceToSkillSource(source) { return source === 'project' ? 'localSettings' : source === 'user' ? 'userSettings' : source; }

async function parseSkillFile(filePath, source) {
  const raw = await fsp.readFile(filePath, 'utf8'); const dir = path.dirname(filePath); const dirName = path.basename(dir); const meta = readInstalledSkillMeta(dir) || {}; const { data, body } = parseFrontmatter(raw); const frontmatter = asSkillFrontmatter(data); const builtin = source === 'builtin'; const replace = (text) => builtin && typeof text === 'string' ? replaceBrandName(text) : text;
  const localIcon = typeof meta.iconLocalPath === 'string' && fs.existsSync(meta.iconLocalPath) ? toLocalFileUrl(meta.iconLocalPath) : undefined;
  return { name: meta.name || frontmatter.name || dirName, filePath, description: replace(frontmatter.description || body.trim().slice(0, 100) || dirName), description_zh: meta.description_zh || replace(frontmatter.description_zh), description_en: meta.description_en || frontmatter.description_en, examples_zh: meta.examples_zh || frontmatter.examples_zh, examples_en: meta.examples_en || frontmatter.examples_en, whenToUse: replace(frontmatter['when-to-use']), source: mapScanSourceToSkillSource(source), type: 'prompt', license: frontmatter.license, allowedTools: normalizeAllowedTools(frontmatter['allowed-tools']), disable: frontmatter.disable ?? false, slug: meta.slug || dirName, skillId: meta.skillId, version: meta.version, installedAt: meta.installedAt, iconSource: dirName, iconUrl: localIcon || (typeof meta.iconSource === 'string' && /^https?:\/\//i.test(meta.iconSource) ? meta.iconSource : undefined), marketplaceSource: ['skillhub', 'marketplace', 'knot'].includes(meta.source) ? meta.source : undefined, userModified: meta.userModified === true ? true : undefined, labels: meta.labels };
}

function readDisableFromFrontmatterLine(content) { const value = FRONTMATTER_RE.exec(String(content))?.[1]?.match(/^disable\s*:\s*(true|false)\s*$/im)?.[1]; return value === undefined ? undefined : value === 'true'; }
function replaceBrandName(text) { return String(text).replace(/CodeBuddy/g, 'WorkBuddy').replace(/\.codebuddy/g, '.workbuddy').replace(/codebuddy/g, 'workbuddy'); }
function resolveLocalIconPath(iconsDir, iconSource) { for (const ext of ['.svg', '.png']) { const file = path.join(iconsDir, `${iconSource}${ext}`); if (fs.existsSync(file)) return toLocalFileUrl(file); } return undefined; }
function readLocalMarketplaceManifest(marketplaceDir) { for (const file of [path.join(marketplaceDir, 'marketplace.json'), path.join(marketplaceDir, '.codebuddy-skill', 'marketplace.json')]) try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {} return null; }
function parseMarketplaceSkillMd(filePath, dirName) { try { const { data } = parseFrontmatter(fs.readFileSync(filePath, 'utf8')); return { name: String(data.name || dirName), description: String(data.description || ''), description_zh: data.description_zh, description_en: data.description_en, version: data.version, author: data.author, tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined, source: data.source, examples_zh: data.examples_zh, examples_en: data.examples_en }; } catch { return null; } }
function scanMarketplaceSkills(marketplaceDir) { const result = []; try { for (const entry of fs.readdirSync(marketplaceDir, { withFileTypes: true })) { const file = path.join(marketplaceDir, entry.name, 'SKILL.md'); if (entry.isDirectory() && fs.existsSync(file)) { const item = parseMarketplaceSkillMd(file, entry.name); if (item) result.push(item); } } } catch {} return result; }
function findMarketplaceSkillDir(marketplaceDir, skillName) { if (!skillName) return null; if (path.isAbsolute(skillName) && fs.existsSync(path.join(skillName, 'SKILL.md'))) return skillName; const direct = path.join(marketplaceDir, skillName); if (fs.existsSync(path.join(direct, 'SKILL.md'))) return direct; try { for (const entry of fs.readdirSync(marketplaceDir, { withFileTypes: true })) { const nested = path.join(marketplaceDir, entry.name, skillName); if (entry.isDirectory() && fs.existsSync(path.join(nested, 'SKILL.md'))) return nested; } } catch {} return null; }

async function copyDirAsync(src, dest) { await fsp.cp(src, dest, { recursive: true, force: true }); }
function copyDirectoryWithRetry(src, dest) { fs.mkdirSync(dest, { recursive: true }); for (const entry of fs.readdirSync(src)) { const from = path.join(src, entry); const to = path.join(dest, entry); if (fs.statSync(from).isDirectory()) copyDirectoryWithRetry(from, to); else copyFileWithRetry(from, to); } }
function copyFileWithRetry(src, dest, maxRetries = 3) { for (let attempt = 0; attempt <= maxRetries; attempt += 1) try { fs.copyFileSync(src, dest); return; } catch (error) { if (!['EINVAL', 'ENOENT'].includes(error.code) || attempt === maxRetries) throw error; sleepSync(50 * (3 ** attempt)); } }
function rmSyncWithRetry(target, maxRetries = 3) { for (let attempt = 0; attempt <= maxRetries; attempt += 1) try { fs.rmSync(target, { recursive: true, force: true }); return; } catch (error) { if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code) || attempt === maxRetries) throw error; sleepSync(100 * (3 ** attempt)); } }
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { const end = Date.now() + ms; while (Date.now() < end) {} } }

function extractZipUtf8Safe(zipPath, destDir) { const AdmZip = require('adm-zip'); const zip = new AdmZip(zipPath); const root = path.resolve(destDir); for (const entry of zip.getEntries()) { const name = (entry.rawEntryName ? entry.rawEntryName.toString('utf8') : entry.entryName).replace(/\\/g, '/'); const target = path.resolve(root, name); const relative = path.relative(root, target); if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`[zip-slip] entry escapes destDir: ${name}`); if (entry.isDirectory) fs.mkdirSync(target, { recursive: true }); else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, entry.getData()); } } }
function resolveInstallTargetDirName(userSkillsDir, baseName, source, metaFileName = '_skillhub_meta.json', metaSource = source) { const base = String(baseName || '').trim() || `unknown__${source}`; const candidate = `${base}__${source}`; try { const old = path.join(userSkillsDir, base); const meta = path.join(old, metaFileName); if (fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, 'utf8')).source === metaSource) return base; } catch {} return candidate; }
function findInstalledDirByMeta(userSkillsDir, metaFileName, metaSource, matchers) { let best; try { for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) { if (!entry.isDirectory()) continue; try { const meta = JSON.parse(fs.readFileSync(path.join(userSkillsDir, entry.name, metaFileName), 'utf8')); if (meta.source !== metaSource || !matchers.some((matcher) => matcher(meta))) continue; if (!best || (meta.installedAt || 0) > best.installedAt) best = { name: entry.name, installedAt: meta.installedAt || 0 }; } catch {} } } catch {} return best?.name; }

const SKILL_ICON_DOWNLOAD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
function isWithinIconDownloadCooldown(failedAt) { return typeof failedAt === 'number' && failedAt > 0 && Date.now() - failedAt < SKILL_ICON_DOWNLOAD_COOLDOWN_MS; }
function pickIconExtension(contentType) { const type = String(contentType || '').split(';')[0].trim().toLowerCase(); return ({ 'image/svg+xml': '.svg', 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico' })[type] || '.img'; }
async function downloadSkillIconAndPersist(fetchFn, skillDir, metaPath, iconUrl) { try { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000); let response; try { response = await fetchFn(iconUrl, { signal: controller.signal }); } finally { clearTimeout(timer); } if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`); const iconPath = path.join(skillDir, `_icon${pickIconExtension(response.headers.get('content-type'))}`); await fsp.writeFile(iconPath, Buffer.from(await response.arrayBuffer())); const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8')); meta.iconLocalPath = iconPath; meta.iconDownloadedFrom = iconUrl; delete meta.iconDownloadFailedAt; await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2)); } catch { try { const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8')); meta.iconDownloadFailedAt = Date.now(); await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2)); } catch {} } }

module.exports = Object.freeze({ AGGREGATED_SKILL_MARKET_PREFIX: '/portal/enterprises', BUILTIN_MARKET_BASE_URL_ENV, BUILTIN_MARKET_META_FILE, BUILTIN_MARKET_META_SOURCE, BUILTIN_MARKET_ROUTE_PREFIX, DEFAULT_CONFIG_DIRNAME, FRONTMATTER_RE, KNOT_BASE_URL, KNOT_USERNAME_ENV, SKILL_ICON_DOWNLOAD_COOLDOWN_MS, asSkillFrontmatter, coerceFrontmatterText, copyDirAsync, copyDirectoryWithRetry, copyFileWithRetry, downloadSkillIconAndPersist, ensureDir, extractZipUtf8Safe, findInstalledDirByMeta, findMarketplaceSkillDir, isWithinIconDownloadCooldown, mapScanSourceToSkillSource, normalizeAllowedTools, parseFrontmatter, parseMarketplaceSkillMd, parseSkillFile, readDisableFromFrontmatterLine, readInstalledSkillMeta, readLocalMarketplaceManifest, replaceBrandName, resolveInstallTargetDirName, resolveLocalIconPath, resolveMarketplaceRoot, resolvePluginDir, resolveWorkbuddyConfigDir, rmSyncWithRetry, scanMarketplaceSkills, scanPluginSkills, scanSkillsDirectory, sleepSync, stringifyFrontmatter });
