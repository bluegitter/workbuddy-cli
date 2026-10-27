'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');

const PLUGIN_METADATA_DIRS = Object.freeze(['.codebuddy-plugin', '.workbuddy-plugin']);
const PLUGIN_MANIFEST_FILE = 'plugin.json';
const MARKETPLACE_MANIFEST_FILE = 'marketplace.json';
const EXPERTS_MARKETPLACE = 'experts';
const CUSTOM_EXPERT_MARKETPLACE = 'my-experts';
const MAX_CUSTOM_EXPERT_AVATAR_BYTES = 5 * 1024 * 1024;

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function normalizeLocalized(value) {
  if (value === undefined || Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  const zh = Array.isArray(value.zh) ? value.zh : [];
  const en = Array.isArray(value.en) ? value.en : [];
  return Array.from({ length: Math.max(zh.length, en.length) }, (_, index) => ({ ...(zh[index] === undefined ? {} : { zh: zh[index] }), ...(en[index] === undefined ? {} : { en: en[index] }) }));
}
function normalizeArray(value) { return value === undefined ? undefined : Array.isArray(value) ? value : []; }
async function pathExists(filePath) { try { await fsp.access(filePath); return true; } catch { return false; } }

class ExpertPluginService {
  constructor({ configDir, getConfigDir, fetchImpl = globalThis.fetch, gatewaySecretHeaders = () => ({}), resolveSessionHttpBase = async () => undefined, downloadAndExtract, logger = console } = {}) {
    this.getConfigDir = getConfigDir || (() => configDir || path.join(require('node:os').homedir(), '.workbuddy'));
    this.fetch = fetchImpl;
    this.gatewaySecretHeaders = gatewaySecretHeaders;
    this.hostCapabilities = { getConfigDir: this.getConfigDir, resolveSessionHttpBase };
    this.downloadAndExtractImpl = downloadAndExtract;
    this.logger = logger;
    this.activeExperts = new Set();
    this.downloadingExperts = new Map();
    this.expertBundleMap = new Map();
    this.marketplaceRegistered = new Set();
    this.scanCustomExpertsInflight = new Map();
    this.customExpertDtoCache = new Map();
  }

  setHostCapabilities(capabilities = {}) { this.hostCapabilities = { ...this.hostCapabilities, ...capabilities }; }
  getConfigDirValue() { return this.hostCapabilities.getConfigDir(); }
  getMarketplaceDir() { return path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', EXPERTS_MARKETPLACE); }
  getPluginDir(bundleName) { return path.join(this.getMarketplaceDir(), 'plugins', bundleName); }
  getPluginDirForMarketplace(bundleName, marketplace = EXPERTS_MARKETPLACE) { return path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', marketplace, 'plugins', bundleName); }
  isUnsafePath(id) { return typeof id !== 'string' || !id || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(id) || /[\\/]/.test(id); }

  async readPluginManifestAsync(dir) {
    for (const metadataDir of PLUGIN_METADATA_DIRS) {
      try { return JSON.parse(await fsp.readFile(path.join(dir, metadataDir, PLUGIN_MANIFEST_FILE), 'utf8')); } catch {}
    }
    return null;
  }
  async hasPluginManifestAsync(dir) { return !!(await this.readPluginManifestAsync(dir)); }
  async resolveBundleName(expertId) {
    return this.expertBundleMap.get(expertId) || String(expertId || '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  }
  async getExpertLocalPath(expertId) { const dir = this.getPluginDir(await this.resolveBundleName(expertId)); return await this.hasPluginManifestAsync(dir) ? dir : undefined; }
  async getExpertManifest(expertId) { return this.readPluginManifestAsync(this.getPluginDir(await this.resolveBundleName(expertId))); }
  async getExpertManifestFromMarketplace(expertId, marketplace) { return this.readPluginManifestAsync(this.getPluginDirForMarketplace(await this.resolveBundleName(expertId), marketplace)); }

  async activateExpert(expertId, pluginName, updatedAt, marketplace, downloadUrl) {
    try {
      const bundleName = pluginName || await this.resolveBundleName(expertId);
      this.expertBundleMap.set(expertId, bundleName);
      const localPath = marketplace ? this.getPluginDirForMarketplace(bundleName, marketplace) : await this.ensureDownloaded(bundleName, updatedAt, downloadUrl);
      const manifest = await this.readPluginManifestAsync(localPath);
      if (!manifest) return { success: false, expertType: 'skill', error: `Failed to read plugin.json for expert: ${expertId}` };
      await this.updateMarketplaceManifest(bundleName, marketplace);
      await this.removeGeneratedAgentOverrideFile(localPath);
      this.activeExperts.add(expertId);
      return { success: true, expertType: manifest.expertType || 'skill', agentName: await this.resolveExpertAgentName(localPath, manifest, expertId), localPath, pluginRegisteredName: manifest.name };
    } catch (error) { return { success: false, expertType: 'skill', error: error instanceof Error ? error.message : String(error) }; }
  }

  async ensureDownloaded(bundleName, updatedAt, downloadUrl) {
    const localPath = this.getPluginDir(bundleName);
    if (await this.hasPluginManifestAsync(localPath)) return localPath;
    if (!this.downloadAndExtractImpl) throw new Error(`Expert bundle is not available locally: ${bundleName}`);
    const pending = this.downloadingExperts.get(bundleName) || Promise.resolve(this.downloadAndExtractImpl(bundleName, localPath, downloadUrl));
    this.downloadingExperts.set(bundleName, pending);
    try { return await pending; } finally { this.downloadingExperts.delete(bundleName); }
  }

  async removeGeneratedAgentOverrideFile(pluginDir) {
    const settingsPath = path.join(pluginDir, 'settings.json');
    try {
      const payload = JSON.parse(await fsp.readFile(settingsPath, 'utf8'));
      if (isRecord(payload) && typeof payload.agent === 'string' && Object.keys(payload).every((key) => key === 'agent')) await fsp.unlink(settingsPath);
    } catch {}
  }
  async deactivateExpert(expertId) { this.activeExperts.delete(expertId); const dir = await this.getExpertLocalPath(expertId); if (dir) await this.removeGeneratedAgentOverrideFile(dir); }
  getActiveExperts() { return [...this.activeExperts]; }

  async resolveSessionHttpBase(sessionId) { try { return await this.hostCapabilities.resolveSessionHttpBase(sessionId); } catch { return undefined; } }
  async resolvePluginMarketplace(pluginName) { return pluginName ? (await this.getExpertManifestFromMarketplace(pluginName, CUSTOM_EXPERT_MARKETPLACE)) ? CUSTOM_EXPERT_MARKETPLACE : EXPERTS_MARKETPLACE : EXPERTS_MARKETPLACE; }
  async registerMarketplaceIfNeeded(httpBase, marketplaceName, marketplaceDir) {
    const key = `${httpBase}:${marketplaceName}`;
    if (this.marketplaceRegistered.has(key)) return;
    try {
      const response = await this.fetch(`${httpBase}/api/v1/plugins/marketplaces`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.gatewaySecretHeaders() }, body: JSON.stringify({ source: marketplaceDir, name: marketplaceName }) });
      if (response.ok) this.marketplaceRegistered.add(key);
    } catch (error) { this.logger.warn?.('[ExpertPluginService] marketplace registration failed', error); }
  }
  async ensureExpertsMarketplaceRegistered(httpBase) {
    await this.registerMarketplaceIfNeeded(httpBase, EXPERTS_MARKETPLACE, this.getMarketplaceDir());
    const customDir = path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', CUSTOM_EXPERT_MARKETPLACE);
    if (await pathExists(customDir)) await this.registerMarketplaceIfNeeded(httpBase, CUSTOM_EXPERT_MARKETPLACE, customDir);
  }

  async switchExpertPluginForSession(sessionId, disablePluginName, enablePluginName, agentName, sourcePluginId, internalModelRequestHeaders) {
    if (!sessionId || (!disablePluginName && !enablePluginName && !agentName && !sourcePluginId && internalModelRequestHeaders === undefined)) return false;
    const httpBase = await this.resolveSessionHttpBase(sessionId);
    if (!httpBase) return false;
    await this.ensureExpertsMarketplaceRegistered(httpBase);
    const disable = disablePluginName ? `${disablePluginName}@${await this.resolvePluginMarketplace(disablePluginName)}` : undefined;
    const enable = enablePluginName ? `${enablePluginName}@${await this.resolvePluginMarketplace(enablePluginName)}` : undefined;
    const resolvedSourcePluginId = sourcePluginId || enable;
    const customOverride = !!agentName && !!enablePluginName && resolvedSourcePluginId?.endsWith(`@${CUSTOM_EXPERT_MARKETPLACE}`);
    const payload = { persist: false, ...(disable ? { disable } : {}), ...(enable ? { enable } : {}), ...(!customOverride && agentName ? { agentName } : {}), ...(!customOverride && resolvedSourcePluginId ? { sourcePluginId: resolvedSourcePluginId } : {}), ...(!customOverride && internalModelRequestHeaders !== undefined ? { internalModelRequestHeaders } : {}) };
    try {
      const request = () => this.fetch(`${httpBase}/api/v1/plugins/switch`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.gatewaySecretHeaders() }, body: JSON.stringify(payload) });
      const response = await request();
      if (!response.ok) return false;
      if (customOverride) {
        const overrideResponse = await this.fetch(`${httpBase}/api/v1/plugins/switch`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.gatewaySecretHeaders() }, body: JSON.stringify({ persist: false, agentName, sourcePluginId: resolvedSourcePluginId, ...(internalModelRequestHeaders !== undefined ? { internalModelRequestHeaders } : {}) }) });
        if (!overrideResponse.ok) return false;
      }
      return true;
    } catch { return false; }
  }

  async isExpertPluginEnabledForSession(sessionId, pluginName, marketplace) {
    const httpBase = await this.resolveSessionHttpBase(sessionId);
    if (!httpBase || !pluginName || !marketplace) return false;
    try { const response = await this.fetch(`${httpBase}/api/v1/plugins`, { headers: this.gatewaySecretHeaders() }); const payload = await response.json(); const list = Array.isArray(payload) ? payload : payload?.data; return response.ok && Array.isArray(list) && list.some((item) => item?.name === pluginName && item?.marketplace === marketplace && item?.status === 'enabled'); } catch { return false; }
  }

  async updateMarketplaceManifest(bundleName, marketplace) {
    const marketplaceName = marketplace || EXPERTS_MARKETPLACE;
    const marketplaceDir = marketplace ? path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', marketplace) : this.getMarketplaceDir();
    const manifestPath = path.join(marketplaceDir, '.codebuddy-plugin', MARKETPLACE_MANIFEST_FILE);
    const pluginDir = path.join(marketplaceDir, 'plugins', bundleName);
    const pluginManifest = await this.readPluginManifestAsync(pluginDir);
    if (!pluginManifest) return;
    let existing = { name: marketplaceName, description: `${marketplaceName} marketplace (auto-generated)`, plugins: [] };
    try { existing = JSON.parse(await fsp.readFile(manifestPath, 'utf8')); } catch {}
    const entry = { name: pluginManifest.name || bundleName, source: `./plugins/${bundleName}`, description: pluginManifest.description };
    const index = (existing.plugins || []).findIndex((item) => item.source === entry.source);
    if (index >= 0) existing.plugins[index] = entry; else (existing.plugins ||= []).push(entry);
    await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
    await fsp.writeFile(manifestPath, JSON.stringify(existing, null, 2), 'utf8');
  }

  async scanCustomExperts(userId) {
    const key = userId || '';
    if (this.scanCustomExpertsInflight.has(key)) return this.scanCustomExpertsInflight.get(key);
    const promise = this.doScanCustomExperts(userId).finally(() => this.scanCustomExpertsInflight.delete(key));
    this.scanCustomExpertsInflight.set(key, promise);
    return promise;
  }
  async doScanCustomExperts(userId) {
    const root = path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', CUSTOM_EXPERT_MARKETPLACE);
    const manifestPath = path.join(root, '.codebuddy-plugin', MARKETPLACE_MANIFEST_FILE);
    let marketplace;
    try { marketplace = JSON.parse(await fsp.readFile(manifestPath, 'utf8')); } catch { return []; }
    const allowed = userId ? new Set(await this.readUserExpertIds(userId)) : undefined;
    const experts = [];
    for (const entry of Array.isArray(marketplace.plugins) ? marketplace.plugins : []) {
      const name = String(entry.source || '').replace(/^\.\/plugins\//, '');
      if (!name || this.isUnsafePath(name) || (allowed && !allowed.has(name))) continue;
      const expert = await this.readCustomExpertFromDir(path.join(root, 'plugins', name), name);
      if (expert) experts.push(expert);
    }
    return experts;
  }
  async readCustomExpertFromDir(expertDir, entryName) {
    const manifest = await this.readPluginManifestAsync(expertDir);
    if (!manifest) return null;
    const json = { ...manifest, version: manifest.version || '1.0.0', id: manifest.id || manifest.name || entryName, expertRootDir: expertDir, isCustomExpert: true, marketplace: CUSTOM_EXPERT_MARKETPLACE };
    for (const key of ['tags', 'quickPrompts', 'triggerPrompts']) json[key] = normalizeLocalized(json[key]);
    for (const key of ['members', 'connectorIds', 'bin', 'references']) json[key] = normalizeArray(json[key]);
    if (json.avatar) json.avatar = await this.resolveAvatarToDataUrl(json.avatar, expertDir);
    return json;
  }
  async getCustomExpert(expertId) { if (this.isUnsafePath(expertId)) return null; return this.readCustomExpertFromDir(path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', CUSTOM_EXPERT_MARKETPLACE, 'plugins', expertId), expertId); }
  getUserExpertsJsonPath(userId) { return path.join(this.getConfigDirValue(), 'experts', 'custom', userId, 'experts.json'); }
  async readUserExpertIds(userId) { if (this.isUnsafePath(userId)) return []; try { const data = JSON.parse(await fsp.readFile(this.getUserExpertsJsonPath(userId), 'utf8')); return Array.isArray(data) ? data : []; } catch { return []; } }
  async addUserExperts(userId, expertIds = []) { if (this.isUnsafePath(userId)) return; const ids = new Set(await this.readUserExpertIds(userId)); for (const id of expertIds) if (!this.isUnsafePath(id)) ids.add(id); const file = this.getUserExpertsJsonPath(userId); await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify([...ids], null, 2)); }
  async clearCustomExpertSessionMarker(expertId) { if (this.isUnsafePath(expertId)) return; await fsp.rm(path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', CUSTOM_EXPERT_MARKETPLACE, 'plugins', expertId, '.created-by-session'), { force: true }).catch(() => {}); }
  async deleteCustomExpert(expertId, userId) { if (this.isUnsafePath(expertId)) return { success: false, error: 'invalid expertId' }; const dir = path.join(this.getConfigDirValue(), 'plugins', 'marketplaces', CUSTOM_EXPERT_MARKETPLACE, 'plugins', expertId); if (!await pathExists(dir)) return { success: false, error: 'expert directory not found' }; await fsp.rm(dir, { recursive: true, force: true }); if (userId) { const ids = (await this.readUserExpertIds(userId)).filter((id) => id !== expertId); const file = this.getUserExpertsJsonPath(userId); await fsp.writeFile(file, JSON.stringify(ids, null, 2)); } return { success: true }; }
  async resolveExpertAgentName(pluginDir, manifest) { return manifest.agentName || manifest.agent || manifest.name; }
  async resolveExpertDependencies() { return []; }
  async resolveAvatarToDataUrl(avatarPath, baseDir) { if (/^(https?|data):/i.test(avatarPath)) return avatarPath; const file = path.resolve(baseDir, avatarPath.replace(/^\.\//, '')); if (!file.startsWith(`${path.resolve(baseDir)}${path.sep}`)) return ''; try { const stat = await fsp.stat(file); if (!stat.isFile() || stat.size > MAX_CUSTOM_EXPERT_AVATAR_BYTES) return ''; const ext = path.extname(file).slice(1).toLowerCase(); const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png'; return `data:${mime};base64,${(await fsp.readFile(file)).toString('base64')}`; } catch { return ''; } }
  async removeGeneratedAgentOverrideFileIfPresent(pluginDir) { return this.removeGeneratedAgentOverrideFile(pluginDir); }
}

module.exports = { ExpertPluginService, PLUGIN_METADATA_DIRS, PLUGIN_MANIFEST_FILE, EXPERTS_MARKETPLACE, CUSTOM_EXPERT_MARKETPLACE, normalizeLocalized, normalizeArray };
