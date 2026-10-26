'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { mapAggregatedListToBuiltinData } = require('../common/aggregated-skill-mapper');
const { extractZipUtf8Safe } = require('../desktop-enterprise-skills-repo');
const { downloadSkillIconAndPersist, isWithinIconDownloadCooldown } = require('./skillhub');

const BUILTIN_MARKET_ROUTE_PREFIX = '/v2/operation-platform/market';
const AGGREGATED_SKILL_MARKET_PREFIX = '/portal/enterprises';
const BUILTIN_MARKET_META_FILE = '_skillhub_meta.json';
const BUILTIN_MARKET_META_SOURCE = 'marketplace';
const BUILTIN_MARKET_BASE_URL_ENV = 'WORKBUDDY_BUILTIN_MARKET_BASE_URL';

function builtinMarketUrl(baseUrl, route) { return `${baseUrl}${BUILTIN_MARKET_ROUTE_PREFIX}${route}`; }
function sanitizeFolderName(raw) { return typeof raw === 'string' ? raw.replace(/[\x00-\x1f<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80) : ''; }
function hasSkillMdFile(dir) { try { return fs.statSync(path.join(dir, 'SKILL.md')).isFile(); } catch { return false; } }

async function builtinMarketGetList(fetchFn, baseUrl, headers, params = {}) {
  if (!baseUrl) return { code: 0, msg: 'success', data: { total_count: 0, skills: [] } };
  if (params.enterpriseId) {
    const query = new URLSearchParams({ source: 'builtin', page: String(params.page ?? 1), page_size: String(params.pageSize ?? 20) });
    if (params.keyword) query.set('keyword', params.keyword);
    const category = params.categories?.find((item) => String(item ?? '').trim());
    if (category) query.set('category', String(category).trim());
    try {
      const response = await fetchFn(`${baseUrl}${AGGREGATED_SKILL_MARKET_PREFIX}/${encodeURIComponent(params.enterpriseId)}/skill-market/list?${query}`, { method: 'POST', headers, body: '{}' });
      if (response.ok) { const json = await response.json(); return json?.code === 0 ? { code: 0, msg: json.msg ?? 'success', data: mapAggregatedListToBuiltinData(json, params.feature, params.categories) } : { code: json?.code ?? -1, msg: json?.msg ?? 'aggregated list failed', data: { total_count: 0, skills: [] } }; }
      if (response.status >= 500) return { code: response.status, msg: response.statusText, data: { total_count: 0, skills: [] } };
    } catch (error) { return { code: -1, msg: error instanceof Error ? error.message : String(error), data: { total_count: 0, skills: [] } }; }
  }
  try {
    const body = { page: params.page ?? 1, page_size: params.pageSize ?? 20 };
    if (params.source) body.source = params.source;
    if (params.categories?.length) body.categories = params.categories;
    if (params.keyword) body.keyword = params.keyword;
    if (params.filterIds?.length) body.filter_ids = params.filterIds;
    const response = await fetchFn(builtinMarketUrl(baseUrl, '/skill/list'), { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) return { code: response.status, msg: response.statusText, data: { total_count: 0, skills: [] } };
    const json = await response.json();
    if (Array.isArray(params.feature) && params.feature.length && json?.data?.skills) {
      const wanted = new Set(params.feature);
      const skills = json.data.skills.filter((item) => wanted.has(item.featured)).sort((a, b) => (a.featured_order ?? Infinity) - (b.featured_order ?? Infinity));
      return { ...json, data: { ...json.data, skills } };
    }
    return json;
  } catch (error) { return { code: -1, msg: error instanceof Error ? error.message : String(error), data: { total_count: 0, skills: [] } }; }
}

async function builtinMarketGetListAggregated(fetchFn, baseUrl, headers, params = {}) {
  if (!baseUrl || !params.enterpriseId) throw new Error('aggregated market requires baseUrl and enterpriseId');
  const query = new URLSearchParams({ source: 'builtin', page: String(params.page ?? 1), page_size: String(params.pageSize ?? 20) });
  if (params.keyword) query.set('keyword', params.keyword);
  const response = await fetchFn(`${baseUrl}${AGGREGATED_SKILL_MARKET_PREFIX}/${encodeURIComponent(params.enterpriseId)}/skill-market/list?${query}`, { method: 'POST', headers, body: '{}' });
  if (!response.ok) { const error = new Error(`aggregated list HTTP ${response.status} ${response.statusText}`); error.httpStatus = response.status; throw error; }
  const json = await response.json();
  if (json.code !== 0) throw new Error(`aggregated list code=${json.code}`);
  return { code: 0, msg: json.msg ?? 'success', data: mapAggregatedListToBuiltinData(json, params.feature, params.categories) };
}

async function builtinMarketGetByIds(fetchFn, baseUrl, headers, skillIds) {
  if (!baseUrl || !Array.isArray(skillIds) || !skillIds.length) return { code: 0, msg: 'success', data: { total_count: 0, skills: [] } };
  try { const response = await fetchFn(builtinMarketUrl(baseUrl, '/skill/get-by-ids'), { method: 'POST', headers, body: JSON.stringify({ skill_ids: skillIds }) }); return response.ok ? response.json() : { code: response.status, msg: response.statusText, data: { total_count: 0, skills: [] } }; }
  catch (error) { return { code: -1, msg: error instanceof Error ? error.message : String(error), data: { total_count: 0, skills: [] } }; }
}

async function builtinMarketGetDownloadUrl(fetchFn, baseUrl, headers, skillId, version) {
  if (!baseUrl) return { code: 0, msg: 'success', data: { download_url: '', skill_id: skillId, version: version ?? '' } };
  try { const body = { skill_id: skillId }; if (version) body.version = version; const response = await fetchFn(builtinMarketUrl(baseUrl, '/skill/download-url'), { method: 'POST', headers, body: JSON.stringify(body) }); return response.ok ? response.json() : { code: response.status, msg: response.statusText, data: { download_url: '' } }; }
  catch (error) { return { code: -1, msg: error instanceof Error ? error.message : String(error), data: { download_url: '' } }; }
}

async function builtinMarketGetCategories(fetchFn, baseUrl, headers, type = 'skill') {
  if (!baseUrl) return { code: 0, msg: 'success', data: { type, total: 0, items: [] } };
  try { const response = await fetchFn(`${builtinMarketUrl(baseUrl, '/categories')}?type=${encodeURIComponent(type)}`, { headers }); return response.ok ? response.json() : { code: response.status, msg: response.statusText, data: { type, total: 0, items: [] } }; }
  catch (error) { return { code: -1, msg: error instanceof Error ? error.message : String(error), data: { type, total: 0, items: [] } }; }
}

async function builtinMarketGetInstalledMetas(userSkillsDir, fetchFn) {
  const metas = [];
  let entries;
  try { entries = fs.readdirSync(userSkillsDir, { withFileTypes: true }); } catch { return metas; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(userSkillsDir, entry.name);
    const metaPath = path.join(skillDir, BUILTIN_MARKET_META_FILE);
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.source !== BUILTIN_MARKET_META_SOURCE || !meta.name || !meta.version || typeof meta.installedAt !== 'number') continue;
      const iconSource = typeof meta.iconSource === 'string' ? meta.iconSource : undefined;
      const iconLocalPath = typeof meta.iconLocalPath === 'string' && fs.existsSync(meta.iconLocalPath) ? meta.iconLocalPath : undefined;
      if (iconSource?.startsWith('http') && !iconLocalPath && !isWithinIconDownloadCooldown(meta.iconDownloadFailedAt)) downloadSkillIconAndPersist(fetchFn, skillDir, metaPath, iconSource);
      metas.push({ skillId: meta.skillId, skillName: meta.name, name: meta.name, version: meta.version, installedAt: meta.installedAt, iconSource, iconLocalPath, iconDownloadedFrom: meta.iconDownloadedFrom, iconDownloadFailedAt: meta.iconDownloadFailedAt, examples_zh: meta.examples_zh, examples_en: meta.examples_en, description_zh: meta.description_zh, description_en: meta.description_en, userModified: meta.userModified === true });
    } catch {}
  }
  return metas;
}

async function builtinMarketBackfill(userSkillsDir, params, field) {
  if (!params?.matchName || !params?.[field]) return 0;
  let count = 0;
  try {
    for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(userSkillsDir, entry.name, BUILTIN_MARKET_META_FILE);
      if (!fs.existsSync(metaPath)) continue;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.source !== BUILTIN_MARKET_META_SOURCE || String(meta.name).trim().toLowerCase() !== String(params.matchName).trim().toLowerCase()) continue;
      if (field === 'skillId' ? meta.skillId : field === 'iconSource' ? /^https?:\/\//i.test(meta.iconSource || '') : meta[field]) continue;
      meta[field] = params[field]; await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2)); count += 1;
    }
  } catch {}
  return count;
}

async function builtinMarketInstall(fetchFn, baseUrl, headers, tempDir, userSkillsDir, params, options = {}) {
  const { skillId, version, name: displayName, skillName, icon, examples_zh, examples_en, description_zh, description_en } = params;
  const identifier = skillName || skillId;
  if (!baseUrl) return { success: false, skillName: identifier, errorMessage: `[CONFIG_ERROR] BuiltinMarket endpoint not configured (set ${BUILTIN_MARKET_BASE_URL_ENV})` };
  try {
    let zipUrl = options.downloadUrl;
    let resolvedVersion = options.resolvedVersion || version;
    if (!zipUrl) { const result = await builtinMarketGetDownloadUrl(fetchFn, baseUrl, headers, skillId, version); if (result.code !== 0 || !result.data?.download_url) return { success: false, skillName: identifier, errorMessage: `[DOWNLOAD_ERROR] ${result.msg || 'missing download_url'}` }; zipUrl = result.data.download_url; resolvedVersion = result.data.version || version; }
    let response = await fetchFn(zipUrl, { redirect: 'manual' });
    for (let redirects = 0; redirects < 5 && response.status >= 300 && response.status < 400; redirects += 1) { const location = response.headers.get('location'); if (!location) break; zipUrl = location.startsWith('http') ? location : new URL(location, zipUrl).href; response = await fetchFn(zipUrl, { redirect: 'manual' }); }
    if (!response.ok) return { success: false, skillName: identifier, errorMessage: `[DOWNLOAD_ERROR] ${response.status} ${response.statusText}` };
    await fsp.mkdir(tempDir, { recursive: true }); await fsp.mkdir(userSkillsDir, { recursive: true });
    const zipPath = path.join(tempDir, `builtin-market-${skillId}-${Date.now()}.zip`); const extractDir = path.join(tempDir, `builtin-market-extract-${skillId}-${Date.now()}`);
    await fsp.writeFile(zipPath, Buffer.from(await response.arrayBuffer())); await fsp.mkdir(extractDir, { recursive: true });
    try { extractZipUtf8Safe(zipPath, extractDir); } finally { await fsp.rm(zipPath, { force: true }); }
    const entries = (await fsp.readdir(extractDir, { withFileTypes: true })).filter((entry) => !entry.name.startsWith('.') && !entry.name.startsWith('__MACOSX')); const sourceDir = entries.length === 1 && entries[0].isDirectory() ? path.join(extractDir, entries[0].name) : extractDir;
    if (!hasSkillMdFile(sourceDir)) return { success: false, skillName: identifier, errorMessage: '[INVALID_PACKAGE] SKILL.md not found' };
    const targetName = sanitizeFolderName(skillName) || skillId || sanitizeFolderName(displayName) || `builtin-${skillId}`; const targetDir = path.join(userSkillsDir, targetName); const metaPath = path.join(targetDir, BUILTIN_MARKET_META_FILE);
    let previous = {}; try { previous = JSON.parse(await fsp.readFile(metaPath, 'utf8')); } catch {}
    await fsp.rm(targetDir, { recursive: true, force: true }); await fsp.mkdir(targetDir, { recursive: true }); await fsp.cp(sourceDir, targetDir, { recursive: true, force: true });
    const meta = { ...previous, name: displayName || identifier, installedAt: previous.installedAt || Date.now(), source: BUILTIN_MARKET_META_SOURCE, version: resolvedVersion || null, skillId }; if (icon) meta.iconSource = icon; if (examples_zh) meta.examples_zh = examples_zh.map(String); if (examples_en) meta.examples_en = examples_en.map(String); if (description_zh) meta.description_zh = description_zh; if (description_en) meta.description_en = description_en;
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2)); if (typeof icon === 'string' && /^https?:\/\//i.test(icon)) downloadSkillIconAndPersist(fetchFn, targetDir, metaPath, icon); await fsp.rm(extractDir, { recursive: true, force: true }); return { success: true, skillName: displayName || identifier, version: resolvedVersion };
  } catch (error) { return { success: false, skillName: identifier, errorMessage: `[DOWNLOAD_ERROR] ${error instanceof Error ? error.message : String(error)}` }; }
}

function createBuiltinMarketSkillHandlers(ctx = {}) {
  const fetchFn = ctx.fetchFn ?? globalThis.fetch; const enqueue = ctx.enqueueInstall ?? ((task) => task());
  const base = async () => process.env[BUILTIN_MARKET_BASE_URL_ENV]?.trim() || await ctx.resolveBuiltinMarketBaseUrl?.() || '';
  const headers = async () => ({ 'Content-Type': 'application/json', ...(await ctx.resolveBuiltinMarketHeaders?.() || {}) });
  return { getBuiltinMarketList: async (params) => builtinMarketGetList(fetchFn, await base(), await headers(), params), getBuiltinMarketByIds: async (ids) => builtinMarketGetByIds(fetchFn, await base(), await headers(), ids), getBuiltinMarketDownloadUrl: async (id, version) => builtinMarketGetDownloadUrl(fetchFn, await base(), await headers(), id, version), getBuiltinMarketCategories: async (type) => builtinMarketGetCategories(fetchFn, await base(), await headers(), type), installBuiltinMarketSkill: async (params) => enqueue(async () => builtinMarketInstall(fetchFn, await base(), await headers(), ctx.tempDir, ctx.userSkillsDir, params)), getBuiltinMarketInstalledMetas: async () => builtinMarketGetInstalledMetas(ctx.userSkillsDir, fetchFn), backfillBuiltinMarketSkillId: async (params) => builtinMarketBackfill(ctx.userSkillsDir, params, 'skillId'), backfillBuiltinMarketIconSource: async (params) => builtinMarketBackfill(ctx.userSkillsDir, params, 'iconSource'), backfillBuiltinMarketDescription: async (params) => builtinMarketBackfill(ctx.userSkillsDir, params, 'description_zh') };
}

module.exports = Object.freeze({ AGGREGATED_SKILL_MARKET_PREFIX, BUILTIN_MARKET_META_FILE, BUILTIN_MARKET_META_SOURCE, BUILTIN_MARKET_ROUTE_PREFIX, builtinMarketGetByIds, builtinMarketGetCategories, builtinMarketGetDownloadUrl, builtinMarketGetInstalledMetas, builtinMarketGetList, builtinMarketGetListAggregated, builtinMarketInstall, builtinMarketUrl, createBuiltinMarketSkillHandlers, sanitizeFolderName });
