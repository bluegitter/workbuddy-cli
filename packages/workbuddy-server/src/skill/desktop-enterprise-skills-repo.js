'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CloudEnterpriseSkillsRepo } = require('./common/cloud-enterprise-skills-repo');

const ENTERPRISE_META_FILE = '_skillhub_meta.json';
const ENTERPRISE_META_SOURCE = 'enterprise';
const TAG = '[SkillsService]';

function extractZipUtf8Safe(zipPath, destination) {
  // Keep the Node-only archive dependency out of the renderer import graph.
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  const root = path.resolve(destination);
  for (const entry of zip.getEntries()) {
    const rawName = entry.rawEntryName ? entry.rawEntryName.toString('utf8') : entry.entryName;
    const normalized = rawName.replace(/\\/g, '/');
    const target = path.resolve(root, normalized);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`[zip-slip] entry escapes destDir: ${rawName}`);
    if (entry.isDirectory) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.getData());
    }
  }
}

class DesktopEnterpriseSkillsRepo extends CloudEnterpriseSkillsRepo {
  constructor(deps = {}) {
    super(deps);
    this.homeDir = deps.context?.homeDir;
    this.fetchFn = deps.context?.fetch ?? globalThis.fetch;
    this.localLogger = deps.context?.logger;
  }

  async getInstalledMetas(params = {}) {
    if (!this.homeDir) return super.getInstalledMetas(params);
    const localMetas = this.readLocalEnterpriseMetas();
    if (!localMetas.length) return [];
    const latest = new Map();
    try {
      const remote = await this.getByIds({ enterpriseId: params.enterpriseId, ids: localMetas.map((item) => item.skillId) });
      for (const skill of remote.skills ?? []) if (skill.id && skill.version) latest.set(skill.id, skill.version);
    } catch (error) {
      this.localLogger?.warn?.(`${TAG} [enterprise.getInstalledMetas] getByIds failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return localMetas.map((item) => ({ ...item, latestVersion: latest.get(item.skillId) ?? '' }));
  }

  readLocalEnterpriseMetas() {
    const result = [];
    const skillsDir = path.join(this.homeDir, 'skills');
    if (!fs.existsSync(skillsDir)) return result;
    let entries;
    try { entries = fs.readdirSync(skillsDir, { withFileTypes: true }); }
    catch (error) {
      this.localLogger?.warn?.(`${TAG} [enterprise.getInstalledMetas] read skills dir failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(skillsDir, entry.name, ENTERPRISE_META_FILE);
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta?.source !== ENTERPRISE_META_SOURCE || typeof meta.skillId !== 'string' || !meta.skillId) continue;
        const version = typeof meta.version === 'string' && meta.version !== 'latest' ? meta.version : '';
        result.push({ skillId: meta.skillId, version, name: meta.name || meta.skillId, userModified: false, latestVersion: '' });
      } catch {
        // Ignore a corrupt entry and continue scanning other installed skills.
      }
    }
    return result;
  }

  async install(params = {}) {
    let cloudResponse;
    try {
      cloudResponse = await super.install(params);
      if (!cloudResponse.success) this.localLogger?.warn?.(`${TAG} [enterprise.install] cloud registration failed; continuing locally: ${cloudResponse.errorMessage ?? 'unknown'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.localLogger?.warn?.(`${TAG} [enterprise.install] cloud registration threw; continuing locally: ${message}`);
      cloudResponse = { success: false, skillName: params.name ?? params.skillId, errorMessage: message };
    }
    if (!this.homeDir) return cloudResponse;
    if (!params.downloadUrl) {
      this.localLogger?.error?.(`${TAG} [enterprise.install] no downloadUrl: skillId=${params.skillId}`);
      return cloudResponse.success ? cloudResponse : { success: false, skillName: params.name ?? params.skillId, errorMessage: cloudResponse.errorMessage || 'missing downloadUrl' };
    }
    try {
      await this.installToLocalSkillsDir(params);
      return { success: true, skillName: params.name ?? params.skillId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.localLogger?.error?.(`${TAG} [enterprise.install] local extract failed: ${message}`);
      return { success: false, skillName: params.name ?? params.skillId, errorMessage: `[LOCAL_EXTRACT_ERROR] ${message}` };
    }
  }

  async installToLocalSkillsDir(params = {}) {
    const { skillId, name, version, downloadUrl } = params;
    if (!skillId || typeof skillId !== 'string') throw new Error('[INVALID_SKILL_ID] skillId is required');
    const skillsDir = path.join(this.homeDir, 'skills');
    const cacheDir = path.join(this.homeDir, 'app', 'cache');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    const targetDir = path.join(skillsDir, skillId);
    const relative = path.relative(skillsDir, targetDir);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`[INVALID_SKILL_ID] skillId out of ${skillsDir}: ${skillId}`);

    const response = await this.fetchFn(downloadUrl, { redirect: 'follow' });
    if (!response?.ok) throw new Error(`[DOWNLOAD_ERROR] ${response?.status ?? 'unknown'} ${response?.statusText ?? ''}`.trim());
    const stamp = Date.now();
    const zipPath = path.join(cacheDir, `enterprise-skill-${skillId}-${stamp}.zip`);
    const extractDir = path.join(cacheDir, `enterprise-skill-extract-${skillId}-${stamp}`);
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    fs.mkdirSync(extractDir, { recursive: true });
    try {
      try { extractZipUtf8Safe(zipPath, extractDir); }
      finally { try { fs.unlinkSync(zipPath); } catch {} }
      const entries = fs.readdirSync(extractDir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.') && !entry.name.startsWith('__MACOSX'));
      let sourceDir = extractDir;
      if (entries.length === 1 && entries[0].isDirectory()) sourceDir = path.join(extractDir, entries[0].name);
      if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) throw new Error('[INVALID_PACKAGE] SKILL.md not found');
      const backupDir = fs.existsSync(targetDir) ? `${targetDir}.bak-${Date.now()}` : undefined;
      if (backupDir) fs.renameSync(targetDir, backupDir);
      try { fs.renameSync(sourceDir, targetDir); }
      catch (error) {
        if (backupDir && fs.existsSync(backupDir) && !fs.existsSync(targetDir)) try { fs.renameSync(backupDir, targetDir); } catch {}
        throw error;
      }
      if (backupDir) try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
      fs.writeFileSync(path.join(targetDir, ENTERPRISE_META_FILE), JSON.stringify({ skillId, name: name || skillId, version: version || 'latest', installedAt: Date.now(), source: ENTERPRISE_META_SOURCE }, null, 2));
    } finally {
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    }
  }
}

module.exports = Object.freeze({ DesktopEnterpriseSkillsRepo, ENTERPRISE_META_FILE, ENTERPRISE_META_SOURCE, extractZipUtf8Safe });
