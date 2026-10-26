'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const MANIFEST_REL_PATH = '.codebuddy-skill/marketplace.json';
const DEFAULT_LOCK_STALE_MS = 300 * 1000;
const DEFAULT_VERSION_CHECK_THROTTLE_MS = 58 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30 * 1000;
const DEFAULT_PRODUCT_SYNC_INTERVAL_MS = 480 * 1000;
const LOCAL_VERSION_FILE_NAME = '.skills-marketplace-version';
const LOCK_NAME = 'built-in-skill-marketplace';

const defaultLogger = {
  info: (message, ...rest) => console.info(`[BuiltinSkillMarketplaceUpdater] ${message}`, ...rest),
  warn: (message, ...rest) => console.warn(`[BuiltinSkillMarketplaceUpdater] ${message}`, ...rest),
  error: (message, ...rest) => console.error(`[BuiltinSkillMarketplaceUpdater] ${message}`, ...rest),
};

let admZip;
function getAdmZip() {
  if (!admZip) {
    // Loading this lazily keeps server startup independent from optional zip support.
    const loaded = require('adm-zip');
    admZip = loaded.default || loaded;
  }
  return admZip;
}

class BuiltinSkillMarketplaceUpdater {
  constructor(options = {}) {
    if (typeof options.getMarketplaces !== 'function') {
      throw new TypeError('getMarketplaces must be a function');
    }
    if (!options.marketplaceDir) throw new TypeError('marketplaceDir is required');
    this.getMarketplaces = options.getMarketplaces;
    this.marketplaceDir = options.marketplaceDir;
    this.versionFileDir = options.versionFileDir || path.dirname(options.marketplaceDir);
    this.lockDir = options.lockDir || this.versionFileDir;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.lockStaleMs = options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS;
    this.versionCheckThrottleMs = options.versionCheckThrottleMs ?? DEFAULT_VERSION_CHECK_THROTTLE_MS;
    this.productSync = options.productSync;
    this.productSyncIntervalMs = options.productSyncIntervalMs ?? DEFAULT_PRODUCT_SYNC_INTERVAL_MS;
    this.logger = options.logger || defaultLogger;
    this.updateTimer = null;
    this.productSyncTimer = null;
  }

  initialize() {
    this.startProductSyncTimer();
  }

  async waitForReady() {}

  dispose() {
    if (this.updateTimer) clearInterval(this.updateTimer);
    if (this.productSyncTimer) clearInterval(this.productSyncTimer);
    this.updateTimer = null;
    this.productSyncTimer = null;
  }

  async triggerUpdate() {
    try {
      await this.checkAndUpdate();
    } catch (error) {
      this.logger.warn('Manual triggerUpdate failed:', error);
    }
  }

  startProductSyncTimer() {
    if (this.productSyncTimer || typeof this.productSync !== 'function' || this.productSyncIntervalMs <= 0) return;
    this.productSyncTimer = setInterval(() => {
      try {
        const result = this.productSync();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {}
    }, this.productSyncIntervalMs);
    this.productSyncTimer.unref?.();
  }

  async checkAndUpdate() {
    if (this.isRecentlyChecked()) return;
    if (!this.tryAcquireLock()) {
      this.logger.info('Another instance is updating, skipping');
      return;
    }
    try {
      const marketplaces = await this.resolveMarketplaces();
      if (!marketplaces.length) return;
      const remoteVersion = this.parseVersionFromUrl(marketplaces[0].url);
      const localVersion = this.readLocalVersion();
      this.logger.info(`skill-marketplace version check: url=${marketplaces[0].url} remoteVersion=${remoteVersion || 'unresolved'} localVersion=${localVersion ?? 'none'}`);
      if (!this.shouldUpdate(remoteVersion)) {
        this.touchVersionFile();
        return;
      }

      for (const { name, url } of marketplaces) {
        const tempDir = path.join(os.tmpdir(), `skills-marketplace-update-${process.pid}-${Date.now()}`);
        try {
          await this.downloadAndExtractToDir(url, tempDir);
          this.logger.info(`Marketplace "${name}" downloaded, replacing local copy...`);
          this.replaceMarketplaceDir(tempDir);
        } catch (error) {
          this.logger.warn(`Failed to update marketplace "${name}":`, error);
        } finally {
          if (fs.existsSync(tempDir)) {
            try { this.rmWithRetry(tempDir); } catch {}
          }
        }
      }

      try {
        this.writePreinstalledMetas();
      } catch (error) {
        this.logger.warn('Failed to write preinstalled skill metas:', error);
      }
      if (remoteVersion) this.writeLocalVersion(remoteVersion);
      else this.touchVersionFile();
      this.logger.info('Update completed');
    } finally {
      this.releaseLock();
    }
  }

  async resolveMarketplaces() {
    try {
      const marketplaces = await this.getMarketplaces();
      return (marketplaces || []).filter((item) => item && item.url);
    } catch (error) {
      this.logger.warn('Failed to resolve marketplaces:', error);
      return [];
    }
  }

  shouldUpdate(remoteVersion) {
    const localVersion = this.readLocalVersion();
    if (!fs.existsSync(this.marketplaceDir)) return true;
    if (!remoteVersion) return localVersion === null;
    return localVersion !== remoteVersion;
  }

  parseVersionFromUrl(url) {
    try {
      return url.match(/skill-marketplace-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.zip/i)?.[1] || '';
    } catch {
      return '';
    }
  }

  isRecentlyChecked() {
    const filePath = path.join(this.versionFileDir, LOCAL_VERSION_FILE_NAME);
    try {
      return fs.existsSync(filePath) && Date.now() - fs.statSync(filePath).mtimeMs < this.versionCheckThrottleMs;
    } catch {
      return false;
    }
  }

  touchVersionFile() {
    const filePath = path.join(this.versionFileDir, LOCAL_VERSION_FILE_NAME);
    try {
      this.ensureDir(this.versionFileDir);
      if (fs.existsSync(filePath)) fs.utimesSync(filePath, new Date(), new Date());
      else fs.writeFileSync(filePath, '', 'utf8');
    } catch {}
  }

  readLocalVersion() {
    const filePath = path.join(this.versionFileDir, LOCAL_VERSION_FILE_NAME);
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) return null;
      if (raw.startsWith('url:')) {
        this.logger.warn(`Discarding legacy cached skill-marketplace version ("${raw.slice(0, 60)}...")`);
        try { fs.unlinkSync(filePath); } catch {}
        return null;
      }
      return raw;
    } catch {
      return null;
    }
  }

  writeLocalVersion(version) {
    try {
      this.ensureDir(this.versionFileDir);
      fs.writeFileSync(path.join(this.versionFileDir, LOCAL_VERSION_FILE_NAME), version, 'utf8');
    } catch (error) {
      this.logger.warn('Failed to write local version:', error);
    }
  }

  async downloadAndExtractToDir(url, targetDir) {
    const Zip = getAdmZip();
    const zip = new Zip(await this.downloadBuffer(url));
    this.ensureDir(targetDir);
    zip.extractAllTo(targetDir, true);
    if (!fs.existsSync(path.join(targetDir, MANIFEST_REL_PATH))) {
      throw new Error(`Downloaded zip does not contain ${MANIFEST_REL_PATH}`);
    }
  }

  downloadBuffer(url, redirects = 0) {
    if (redirects > 5) return Promise.reject(new Error(`Too many redirects for ${url}`));
    return new Promise((resolve, reject) => {
      let parsed;
      try { parsed = new URL(url); } catch { reject(new Error(`Invalid download URL: ${url}`)); return; }
      const request = (parsed.protocol === 'https:' ? https : http).get(parsed, { timeout: this.requestTimeoutMs }, (response) => {
        const statusCode = response.statusCode || 0;
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          const nextUrl = new URL(response.headers.location, parsed).href;
          response.resume();
          this.downloadBuffer(nextUrl, redirects + 1).then(resolve, reject);
          return;
        }
        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with status ${statusCode}: ${url}`));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.on('timeout', () => request.destroy(new Error(`Request timeout after ${this.requestTimeoutMs}ms: ${url}`)));
    });
  }

  replaceMarketplaceDir(sourceDir) {
    const backupDir = `${this.marketplaceDir}.backup-${process.pid}`;
    this.ensureDir(path.dirname(this.marketplaceDir));
    if (fs.existsSync(backupDir)) {
      try { this.rmWithRetry(backupDir); } catch {}
    }
    if (fs.existsSync(this.marketplaceDir)) {
      try { fs.renameSync(this.marketplaceDir, backupDir); } catch {
        try { this.rmWithRetry(this.marketplaceDir); } catch (error) { this.logger.warn('Failed to remove old marketplace dir:', error); }
      }
    }
    try {
      fs.renameSync(sourceDir, this.marketplaceDir);
    } catch (error) {
      try { this.copyDir(sourceDir, this.marketplaceDir); } catch (copyError) {
        if (fs.existsSync(backupDir) && !fs.existsSync(this.marketplaceDir)) {
          try { fs.renameSync(backupDir, this.marketplaceDir); } catch {}
        }
        throw copyError;
      }
    }
    if (fs.existsSync(backupDir)) {
      try { this.rmWithRetry(backupDir); } catch {}
    }
  }

  writePreinstalledMetas() {
    const manifestPath = path.join(this.marketplaceDir, MANIFEST_REL_PATH);
    if (!fs.existsSync(manifestPath)) return;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (error) {
      this.logger.warn('Failed to parse marketplace manifest for meta backfill:', error);
      return;
    }
    if (!Array.isArray(manifest?.skills)) return;
    const skillsRoot = path.join(this.marketplaceDir, 'skills');
    for (const entry of manifest.skills) {
      const slug = entry?.source;
      const displayName = entry?.name;
      if (!slug || !displayName) continue;
      const skillDir = path.join(skillsRoot, slug);
      if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue;
      const metaPath = path.join(skillDir, '_skillhub_meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (existing?.preinstalledTemplate !== true) continue;
          if (existing.name === displayName && existing.slug === slug && existing.version === entry.version) continue;
        } catch {}
      }
      try {
        fs.writeFileSync(metaPath, JSON.stringify({ name: displayName, slug, version: entry.version, installedAt: Date.now(), source: 'marketplace', iconSource: slug, preinstalledTemplate: true }, null, 2), 'utf8');
      } catch (error) {
        this.logger.warn(`Failed to write preinstalled meta for "${slug}":`, error);
      }
    }
  }

  tryAcquireLock() {
    this.ensureDir(this.lockDir);
    const lockFile = this.getLockFilePath();
    if (fs.existsSync(lockFile)) {
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > this.lockStaleMs) fs.unlinkSync(lockFile);
        else return false;
      } catch {}
    }
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, timestamp: Date.now(), hostname: os.hostname() }), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error?.code !== 'EEXIST') this.logger.warn('Failed to acquire lock:', error);
      return false;
    }
  }

  releaseLock() {
    const lockFile = this.getLockFilePath();
    try {
      if (JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid === process.pid) fs.unlinkSync(lockFile);
    } catch {}
  }

  getLockFilePath() { return path.join(this.lockDir, `${LOCK_NAME}.lock`); }

  ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

  copyDir(source, target) {
    this.ensureDir(target);
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      if (entry.isDirectory()) this.copyDir(sourcePath, targetPath);
      else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
    }
  }

  rmWithRetry(target, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try { fs.rmSync(target, { recursive: true, force: true }); return; } catch (error) {
        if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code) || attempt === maxRetries) throw error;
        this.sleepSync(100 * (3 ** attempt));
      }
    }
  }

  sleepSync(ms) {
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {
      const end = Date.now() + ms;
      while (Date.now() < end) {}
    }
  }
}

module.exports = Object.freeze({
  MANIFEST_REL_PATH,
  DEFAULT_LOCK_STALE_MS,
  DEFAULT_VERSION_CHECK_THROTTLE_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_PRODUCT_SYNC_INTERVAL_MS,
  LOCAL_VERSION_FILE_NAME,
  LOCK_NAME,
  BuiltinSkillMarketplaceUpdater,
});
