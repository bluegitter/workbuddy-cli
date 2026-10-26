'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { extractZipUtf8Safe } = require('../desktop-enterprise-skills-repo');
const { resolveInstallTargetDirName } = require('./local-marketplace');

const KNOT_BASE_URL = 'https://knot.woa.com/apigw/api/v1/skills';
const KNOT_USERNAME_ENV = 'WORKBUDDY_KNOT_USERNAME';
const KNOT_TOKEN_ENV = 'WORKBUDDY_KNOT_TOKEN';
const DEFAULT_KNOT_TOKEN = 'workbuddy-1d80bd13-d271-4596-a169-a6cdc12a4141';

function knotHeaders(username) {
  const login = username?.trim();
  const environment = process.env[KNOT_USERNAME_ENV]?.trim();
  return {
    'Content-Type': 'application/json',
    'X-Username': login || environment || '',
    'X-Knot-Token': process.env[KNOT_TOKEN_ENV]?.trim() || DEFAULT_KNOT_TOKEN,
  };
}

function normalizeKnotSkill(raw = {}) {
  const id = Number(raw.id ?? 0);
  const skillName = String(raw.skill_name ?? '');
  const displayName = String(raw.display_name ?? skillName);
  const description = String(raw.description ?? '');
  const updatedAtRaw = String(raw.updated_at ?? raw.created_at ?? '');
  const updatedAt = Number.isFinite(Date.parse(updatedAtRaw)) ? Date.parse(updatedAtRaw) : 0;
  const downloadCount = Number(raw.download_count ?? 0);
  const slug = String(raw.slug ?? (skillName || id));
  const version = typeof raw.version === 'string' && raw.version ? raw.version : '0.0.0';
  return { id, skill_name: skillName, display_name: displayName, description, description_zh: description, creator: String(raw.creator ?? ''), visibility: String(raw.visibility ?? ''), download_count: downloadCount, created_at: String(raw.created_at ?? ''), updated_at_raw: updatedAtRaw, slug, ownerName: String(raw.creator ?? ''), category: '', name: displayName || skillName, version, homepage: '', tags: [], downloads: downloadCount, stars: 0, installs: 0, updated_at: updatedAt, score: downloadCount };
}

async function knotGetList(fetchFn, params = {}, username) {
  try {
    const query = new URLSearchParams({ order_by: 'download_count' });
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('page_size', String(params.pageSize));
    if (params.keyword) query.set('search_keyword', params.keyword);
    if (params.category) query.set('tag_ids', params.category);
    const response = await fetchFn(`${KNOT_BASE_URL}/list?${query}`, { headers: knotHeaders(username) });
    if (!response.ok) return { code: response.status, message: response.statusText, data: { total: 0, skills: [] } };
    const body = await response.json();
    if (body.code !== 0) return { code: body.code, message: body.message, data: { total: 0, skills: [] } };
    const list = Array.isArray(body.data) ? body.data : body.data?.list ?? [];
    const total = Array.isArray(body.data) ? list.length : Number(body.data?.total ?? list.length);
    return { code: 0, message: body.message || 'success', data: { total, skills: list.map(normalizeKnotSkill) } };
  } catch (error) { return { code: -1, message: error instanceof Error ? `${error.name}: ${error.message}` : String(error), data: { total: 0, skills: [] } }; }
}

async function knotGetByIds(fetchFn, ids, username) {
  if (!Array.isArray(ids) || !ids.length) return { code: 0, message: 'success', data: [] };
  try {
    const response = await fetchFn(`${KNOT_BASE_URL}/get_by_ids`, { method: 'POST', headers: knotHeaders(username), body: JSON.stringify({ ids }) });
    if (!response.ok) return { code: response.status, message: response.statusText, data: [] };
    const body = await response.json();
    return body.code === 0 && Array.isArray(body.data) ? { code: 0, message: body.message || 'success', data: body.data.map(normalizeKnotSkill) } : { code: body.code ?? -1, message: body.message ?? '', data: [] };
  } catch (error) { return { code: -1, message: String(error), data: [] }; }
}

async function knotGetTags(fetchFn, username) {
  try {
    const response = await fetchFn(`${KNOT_BASE_URL}/list_tags`, { headers: knotHeaders(username) });
    if (!response.ok) return { code: response.status, message: response.statusText, data: [] };
    const body = await response.json();
    return body.code === 0 ? { code: 0, message: body.message || 'success', data: (Array.isArray(body.data) ? body.data : []).map((tag) => ({ id: String(tag.id ?? ''), tag_name: String(tag.tag_name ?? ''), display_name: String(tag.display_name ?? '') })) } : { code: body.code, message: body.message, data: [] };
  } catch (error) { return { code: -1, message: String(error), data: [] }; }
}

async function knotGetDetail(fetchFn, slug, username) {
  const list = await knotGetList(fetchFn, { keyword: slug, page: 1, pageSize: 10 }, username);
  const candidate = list.data.skills.find((skill) => skill.slug === slug || String(skill.id) === slug) || list.data.skills[0];
  if (!candidate) return emptyKnotDetail(slug);
  const detail = (await knotGetByIds(fetchFn, [candidate.id], username)).data[0] || candidate;
  return { skill: { slug: detail.slug, category: detail.category, displayName: detail.display_name, summary: detail.description, summary_zh: detail.description_zh, tags: {}, stats: { downloads: detail.downloads, stars: detail.stars, installs: detail.installs, versions: 1, comments: 0 }, createdAt: Date.parse(detail.created_at) || 0, updatedAt: detail.updated_at }, latestVersion: { version: detail.version, createdAt: detail.updated_at, changelog: '' }, owner: { handle: detail.ownerName, displayName: detail.ownerName, image: null } };
}

function emptyKnotDetail(slug) { return { skill: { slug, category: '', displayName: slug, summary: '', summary_zh: '', tags: {}, stats: { downloads: 0, stars: 0, installs: 0, versions: 0, comments: 0 }, createdAt: 0, updatedAt: 0 }, latestVersion: { version: 'latest', createdAt: 0, changelog: '' }, owner: { handle: '', displayName: '', image: null } }; }

async function knotGetInstalledMetas(userSkillsDir) {
  const metas = [];
  try {
    for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(userSkillsDir, entry.name, '_knot_meta.json');
      if (!fs.existsSync(file)) continue;
      const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (meta.source !== 'knot') continue;
      metas.push({ slug: meta.slug || entry.name, id: typeof meta.id === 'number' ? meta.id : undefined, name: meta.name, version: meta.version === 'latest' ? null : meta.version, installedAt: meta.installedAt });
    }
  } catch {}
  return metas;
}

async function knotInstall(fetchFn, tempDir, userSkillsDir, id, version, name, skillName, slug, username) {
  const displayName = name || String(id);
  try {
    const response = await fetchFn(`${KNOT_BASE_URL}/download?id=${id}`, { headers: knotHeaders(username) });
    if (!response.ok) return { success: false, skillName: displayName, errorMessage: `[DOWNLOAD_ERROR] ${response.status} ${response.statusText}` };
    const body = await response.json();
    if (body.code !== 0 || !body.data?.file_url) return { success: false, skillName: displayName, errorMessage: `[DOWNLOAD_ERROR] ${body.message || 'missing file_url'}` };
    let url = body.data.file_url;
    let zipResponse = await fetchFn(url, { redirect: 'manual' });
    for (let redirects = 0; redirects < 5 && zipResponse.status >= 300 && zipResponse.status < 400; redirects += 1) {
      const location = zipResponse.headers.get('location');
      if (!location) break;
      url = location.startsWith('http') ? location : new URL(location, url).href;
      zipResponse = await fetchFn(url, { redirect: 'manual' });
    }
    if (!zipResponse.ok) return { success: false, skillName: displayName, errorMessage: `[DOWNLOAD_ERROR] ${zipResponse.status} ${zipResponse.statusText}` };
    await fsp.mkdir(tempDir, { recursive: true });
    const zipPath = path.join(tempDir, `knot-${id}-${Date.now()}.zip`);
    const extractDir = path.join(tempDir, `knot-extract-${id}-${Date.now()}`);
    await fsp.writeFile(zipPath, Buffer.from(await zipResponse.arrayBuffer()));
    await fsp.mkdir(extractDir, { recursive: true });
    try { extractZipUtf8Safe(zipPath, extractDir); } finally { await fsp.rm(zipPath, { force: true }); }
    const entries = (await fsp.readdir(extractDir, { withFileTypes: true })).filter((entry) => !entry.name.startsWith('.') && !entry.name.startsWith('__MACOSX'));
    const sourceDir = entries.length === 1 && entries[0].isDirectory() ? path.join(extractDir, entries[0].name) : extractDir;
    const targetName = resolveInstallTargetDirName(userSkillsDir, skillName || String(id), 'knot', '_knot_meta.json');
    const targetDir = path.join(userSkillsDir, targetName);
    await fsp.rm(targetDir, { recursive: true, force: true });
    await fsp.mkdir(targetDir, { recursive: true });
    await fsp.cp(sourceDir, targetDir, { recursive: true, force: true });
    await fsp.writeFile(path.join(targetDir, '_knot_meta.json'), JSON.stringify({ id, slug: slug || skillName || String(id), name: displayName, version: version ?? null, installedAt: Date.now(), source: 'knot', fileHash: body.data.file_hash }, null, 2));
    await fsp.rm(extractDir, { recursive: true, force: true });
    return { success: true, skillName: displayName };
  } catch (error) { return { success: false, skillName: displayName, errorMessage: `[DOWNLOAD_ERROR] ${error instanceof Error ? error.message : String(error)}` }; }
}

function createKnotSkillHandlers(ctx = {}) {
  const fetchFn = ctx.fetchFn ?? globalThis.fetch;
  const username = async () => ctx.resolveKnotUsername ? ctx.resolveKnotUsername() : undefined;
  return {
    getKnotList: async (params) => knotGetList(fetchFn, params, await username()),
    getKnotByIds: async (ids) => knotGetByIds(fetchFn, ids, await username()),
    getKnotCategories: async () => ({ items: [], count: 0 }),
    getKnotTags: async () => knotGetTags(fetchFn, await username()),
    getKnotSearch: async (query, limit = 20) => ({ results: (await knotGetList(fetchFn, { keyword: query, page: 1, pageSize: limit }, await username())).data.skills.slice(0, limit).map((skill) => ({ score: skill.score, slug: skill.slug, displayName: skill.display_name, summary: skill.description, version: skill.version, updatedAt: skill.updated_at })) }),
    getKnotDetail: async (slug) => knotGetDetail(fetchFn, slug, await username()),
    getKnotExists: async (slugs) => { const installed = new Set((await knotGetInstalledMetas(ctx.userSkillsDir)).map((meta) => meta.slug)); return { exists: Object.fromEntries(slugs.map((slug) => [slug, installed.has(slug)])), count: slugs.filter((slug) => installed.has(slug)).length }; },
    getKnotInstalledMetas: async () => knotGetInstalledMetas(ctx.userSkillsDir),
    installKnotSkill: async (id, version, name, skillName, slug) => knotInstall(fetchFn, ctx.tempDir, ctx.userSkillsDir, id, version, name, skillName, slug, await username()),
    reportKnotStats: async () => undefined,
  };
}

module.exports = Object.freeze({ KNOT_BASE_URL, DEFAULT_KNOT_TOKEN, createKnotSkillHandlers, emptyKnotDetail, knotGetByIds, knotGetDetail, knotGetInstalledMetas, knotGetList, knotGetTags, knotHeaders, knotInstall, normalizeKnotSkill });
