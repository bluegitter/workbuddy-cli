'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { SKILLHUB_BASE_URL, buildSkillHubHeaders } = require('../skillhub-shared');
const { extractZipUtf8Safe } = require('../desktop-enterprise-skills-repo');
const { resolveInstallTargetDirName } = require('./local-marketplace');

const ICON_DOWNLOAD_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function isWithinIconDownloadCooldown(timestamp) {
  return typeof timestamp === 'number' && Date.now() - timestamp < ICON_DOWNLOAD_COOLDOWN_MS;
}

function findInstalledDirBySlug(userSkillsDir, slug) {
  try {
    for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(userSkillsDir, entry.name, '_skillhub_meta.json');
      if (!fs.existsSync(file)) continue;
      try { if (JSON.parse(fs.readFileSync(file, 'utf8')).source === 'skillhub' && JSON.parse(fs.readFileSync(file, 'utf8')).slug === slug) return entry.name; } catch {}
    }
  } catch {}
  return undefined;
}

async function downloadSkillIconAndPersist(fetchFn, skillDir, metaPath, iconUrl) {
  try {
    const response = await fetchFn(iconUrl, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = new URL(iconUrl).pathname.toLowerCase().endsWith('.svg') ? '.svg' : '.png';
    const iconPath = path.join(skillDir, `icon${extension}`);
    await fsp.writeFile(iconPath, buffer);
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    meta.iconLocalPath = iconPath;
    meta.iconDownloadedFrom = iconUrl;
    delete meta.iconDownloadFailedAt;
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
  } catch {
    try {
      const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
      meta.iconDownloadFailedAt = Date.now();
      await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch {}
  }
}

function createSkillHubSkillHandlers(ctx = {}) {
  const fetchFn = ctx.fetchFn ?? globalThis.fetch;
  const tempDir = ctx.tempDir;
  const userSkillsDir = ctx.userSkillsDir;
  const resolveApiKey = async () => {
    try { return ctx.getApiKey ? await ctx.getApiKey() : undefined; } catch (error) { console.warn('[SkillHub] getApiKey failed:', String(error)); return undefined; }
  };
  const skillHubFetch = async (url, init = {}) => fetchFn(url, { ...init, headers: buildSkillHubHeaders(init.headers, await resolveApiKey()) });

  return {
    getSkillHubCategories: async () => {
      const response = await skillHubFetch(`${SKILLHUB_BASE_URL}/api/v1/categories`);
      return response.ok ? response.json() : { items: [], count: 0 };
    },
    getSkillHubDetail: async (slug) => {
      const response = await skillHubFetch(`${SKILLHUB_BASE_URL}/api/v1/skills/${encodeURIComponent(slug)}`);
      if (!response.ok) throw new Error(`SkillHub detail failed: ${response.status}`);
      return response.json();
    },
    getSkillHubExists: async (slugs) => {
      const response = await skillHubFetch(`${SKILLHUB_BASE_URL}/api/v1/skills/exists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs }) });
      return response.ok ? response.json() : { exists: {}, count: 0 };
    },
    getSkillHubList: async (params = {}) => {
      const query = new URLSearchParams();
      for (const key of ['page', 'pageSize', 'sortBy', 'order', 'keyword', 'category']) if (params[key]) query.set(key, String(params[key]));
      const response = await skillHubFetch(`${SKILLHUB_BASE_URL}/api/skills?${query}`);
      return response.ok ? response.json() : { code: response.status, message: response.statusText, data: { total: 0, skills: [] } };
    },
    getSkillHubSearch: async (query, limit) => {
      const params = new URLSearchParams({ q: String(query ?? '') });
      if (limit) params.set('limit', String(limit));
      const response = await skillHubFetch(`${SKILLHUB_BASE_URL}/api/v1/search?${params}`);
      return response.ok ? response.json() : { results: [] };
    },
    getSkillHubInstalledMetas: async () => {
      const metas = [];
      let entries;
      try { entries = fs.readdirSync(userSkillsDir, { withFileTypes: true }); } catch { return metas; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(userSkillsDir, entry.name);
        const metaPath = path.join(skillDir, '_skillhub_meta.json');
        if (!fs.existsSync(metaPath)) continue;
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta.source !== 'skillhub') continue;
          let iconLocalPath = typeof meta.iconLocalPath === 'string' && fs.existsSync(meta.iconLocalPath) ? meta.iconLocalPath : undefined;
          const iconSource = typeof meta.iconSource === 'string' ? meta.iconSource : undefined;
          if (iconSource && /^https?:\/\//i.test(iconSource) && (!iconLocalPath || meta.iconDownloadedFrom !== iconSource) && !isWithinIconDownloadCooldown(meta.iconDownloadFailedAt)) downloadSkillIconAndPersist(fetchFn, skillDir, metaPath, iconSource);
          metas.push({ slug: meta.slug || entry.name, version: meta.version || null, installedAt: meta.installedAt, iconSource, iconLocalPath, iconDownloadedFrom: meta.iconDownloadedFrom, iconDownloadFailedAt: meta.iconDownloadFailedAt, labels: meta.labels });
        } catch {}
      }
      return metas;
    },
    installSkillHubSkill: async (slug, version, name, iconUrl, labels) => {
      try {
        await fsp.mkdir(tempDir, { recursive: true });
        const query = new URLSearchParams({ slug });
        if (version) query.set('version', version);
        const response = await skillHubFetch(`${SKILLHUB_BASE_URL}/api/v1/download?${query}`, { redirect: 'follow' });
        if (!response.ok) return { success: false, skillName: name || slug, errorMessage: `[DOWNLOAD_ERROR] ${response.status} ${response.statusText}` };
        const zipPath = path.join(tempDir, `skillhub-${slug}-${Date.now()}.zip`);
        await fsp.writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
        const existingDirName = findInstalledDirBySlug(userSkillsDir, slug);
        const targetDirName = existingDirName || resolveInstallTargetDirName(userSkillsDir, slug, 'skillhub', '_skillhub_meta.json');
        const targetDir = path.join(userSkillsDir, targetDirName);
        await fsp.mkdir(targetDir, { recursive: true });
        if (existingDirName) for (const item of await fsp.readdir(targetDir)) await fsp.rm(path.join(targetDir, item), { recursive: true, force: true });
        try { extractZipUtf8Safe(zipPath, targetDir); } finally { await fsp.rm(zipPath, { force: true }); }
        const meta = { slug, name: name || slug, version: version || 'latest', installedAt: Date.now(), source: 'skillhub' };
        const validIcon = typeof iconUrl === 'string' && /^https?:\/\//i.test(iconUrl) ? iconUrl : undefined;
        if (validIcon) meta.iconSource = validIcon;
        if (labels && typeof labels === 'object') meta.labels = labels;
        const metaPath = path.join(targetDir, '_skillhub_meta.json');
        await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
        if (validIcon) downloadSkillIconAndPersist(fetchFn, targetDir, metaPath, validIcon);
        return { success: true, skillName: name || slug };
      } catch (error) { return { success: false, skillName: name || slug, errorMessage: `[DOWNLOAD_ERROR] ${error instanceof Error ? error.message : String(error)}` }; }
    },
    reportSkillHubStats: async (slug, increment) => {
      try { await skillHubFetch(`${SKILLHUB_BASE_URL}/api/v1/stats/${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(increment) }); } catch (error) { console.warn('[SkillHub] reportStats failed:', String(error)); }
    },
  };
}

module.exports = Object.freeze({ createSkillHubSkillHandlers, downloadSkillIconAndPersist, isWithinIconDownloadCooldown });
