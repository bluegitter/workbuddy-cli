'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { handleRpc } = require('../server/handler-registry');
const { createSkillsService } = require('./service');
const { withSkillInstallMetric } = require('./install-metric');
const { runSkillRecommend, SkillRecommendTransportError } = require('./common/skill-recommend-service');

function register(registry, channel, handler) { handleRpc(registry, channel, handler); }

function registerSkillsHandlers(registry, deps = {}, options = {}) {
  const service = createSkillsService({ ...options, reporter: options.reporter || deps.reporter, fetchFn: options.fetchFn || deps.fetchFn, builtinSkillsDir: options.builtinSkillsDir || deps.builtinSkillsDir, marketplaceUpdater: options.marketplaceUpdater || deps.marketplaceUpdater, getBuiltinMarketEndpoint: options.getBuiltinMarketEndpoint || deps.getBuiltinMarketEndpoint, getBuiltinMarketAuthHeaders: options.getBuiltinMarketAuthHeaders || deps.getBuiltinMarketAuthHeaders, getSkillHubApiKey: options.getSkillHubApiKey || deps.getSkillHubApiKey, getEnterpriseId: options.getEnterpriseId, getKnotUsername: options.getKnotUsername });
  const direct = {
    skillList: (params) => service.getSkillList(params), skillToggle: (params) => service.toggleSkill(params), skillDelete: (params) => service.deleteSkill(params), skillContent: (params) => service.getSkillContent(params), skillGetContent: (params) => service.getSkillContent(params),
    skillGetMarketplace: () => service.getMarketplaceSkills(), skillGetMarketplaceContent: (params) => service.getMarketplaceSkillContent(params), marketplaceList: () => service.getMarketplaceSkills(), marketplaceContent: (params) => service.getMarketplaceSkillContent(params),
    skillhubList: (params) => service.getSkillHubList(params), skillhubCategories: () => service.getSkillHubCategories(), skillhubSearch: (query, limit) => service.getSkillHubSearch(query, limit), skillhubDetail: (slug) => service.getSkillHubDetail(slug), skillhubExists: (slugs) => service.getSkillHubExists(slugs), skillhubReportStats: (slug, increment) => service.reportSkillHubStats(slug, increment), skillhubInstalledMetas: () => service.getSkillHubInstalledMetas(),
    knotList: (params) => service.getKnotList(params), knotCategories: () => service.getKnotCategories(), knotTags: () => service.getKnotTags(), knotSearch: (query, limit) => service.getKnotSearch(query, limit), knotDetail: (slug) => service.getKnotDetail(slug), knotExists: (slugs) => service.getKnotExists(slugs), knotInstalledMetas: () => service.getKnotInstalledMetas(), knotGetByIds: (ids) => service.getKnotByIds(ids),
    builtinMarketList: (params) => service.getBuiltinMarketList(params), builtinMarketGetByIds: (ids) => service.getBuiltinMarketByIds(ids), builtinMarketDownloadUrl: (id, version) => service.getBuiltinMarketDownloadUrl(id, version), builtinMarketCategories: (type) => service.getBuiltinMarketCategories(type), builtinMarketInstalledMetas: () => service.getBuiltinMarketInstalledMetas(), builtinMarketBackfillSkillId: (params) => service.backfillBuiltinMarketSkillId(params), builtinMarketBackfillIconSource: (params) => service.backfillBuiltinMarketIconSource(params), builtinMarketBackfillDescription: (params) => service.backfillBuiltinMarketDescription(params), builtinMarketMigrateDirsToSkillId: () => service.migrateBuiltinMarketDirsToSkillId(),
  };
  for (const [channel, handler] of Object.entries(direct)) register(registry, channel, handler);
  register(registry, 'skillInstallByPath', (params) => withSkillInstallMetric(options.reporter || deps.reporter, 'local_path', path.basename(params?.folderPath || '__unknown__'), () => service.installSkillByPath(params)));
  register(registry, 'skillInstallMarketplace', (params) => withSkillInstallMetric(options.reporter || deps.reporter, 'local_marketplace', params?.skillName || '__unknown__', () => service.installMarketplaceSkill(params)));
  register(registry, 'marketplaceInstall', (params) => withSkillInstallMetric(options.reporter || deps.reporter, 'local_marketplace', params?.skillName || '__unknown__', () => service.installMarketplaceSkill(params)));
  register(registry, 'skillhubInstall', (slug, version, name, iconUrl, labels) => withSkillInstallMetric(options.reporter || deps.reporter, 'skillhub', name || slug, () => service.installSkillHubSkill(slug, version, name, iconUrl, labels)));
  register(registry, 'knotInstall', (id, version, name, skillName, slug) => withSkillInstallMetric(options.reporter || deps.reporter, 'knot', skillName || name || slug || String(id), () => service.installKnotSkill(id, version, name, skillName, slug)));
  register(registry, 'builtinMarketInstall', (params) => withSkillInstallMetric(options.reporter || deps.reporter, 'builtin_market', params?.skillName || params?.name || params?.skillId || '__unknown__', () => service.installBuiltinMarketSkill(params)));
  register(registry, 'skillRecommend', (params) => runSkillRecommend({ getEndpoint: async () => (options.getBuiltinMarketEndpoint || deps.getBuiltinMarketEndpoint)?.(), getAuthHeaders: async () => (options.getBuiltinMarketAuthHeaders || deps.getBuiltinMarketAuthHeaders)?.() || {}, transport: createSkillRecommendFetchTransport(options.fetchFn || deps.fetchFn || globalThis.fetch), logger: deps.logger || console }, params));
  register(registry, 'skillExportZip', (params) => exportSkillZip(params));
  return service;
}

function registerSkillHandlers(registry, deps = {}) { return registerSkillsHandlers(registry, deps, deps.options || deps); }

function createSkillRecommendFetchTransport(fetchFn) {
  return { async postChatCompletions({ url, body, headers, timeoutMs }) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const response = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal }); const text = await response.text(); if (!response.ok) throw new SkillRecommendTransportError({ message: text || `${response.status} ${response.statusText}`, status: response.status, code: 'http_error' }); return text; } catch (error) { if (error instanceof SkillRecommendTransportError) throw error; throw new SkillRecommendTransportError({ message: error instanceof Error ? error.message : String(error), code: error?.name === 'AbortError' ? 'timeout' : 'unknown' }); } finally { clearTimeout(timer); } } };
}

async function exportSkillZip(params = {}) {
  if (!params.skillRootDir || !params.skillName) return { success: false, error: 'Invalid skill exportZip params: skillRootDir and skillName are required' };
  try {
    await fsp.access(params.skillRootDir);
    const AdmZip = require('adm-zip'); const zip = new AdmZip(); zip.addLocalFolder(params.skillRootDir, params.skillName);
    const zipPath = path.join(os.tmpdir(), `skill-export-${params.skillName}-${Date.now()}.zip`); zip.writeZip(zipPath);
    return { success: true, zipPath, metadata: { title: params.skillName } };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
}

module.exports = Object.freeze({ createSkillRecommendFetchTransport, exportSkillZip, registerSkillHandlers, registerSkillsHandlers });
