'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_UPDATE_INTERVAL_MS = 60 * 1000;
const DEFAULT_LOCK_STALE_MS = 300 * 1000;
const DEFAULT_VERSION_CHECK_THROTTLE_MS = 58 * 1000;
const LOCK_NAME = 'built-in-plugin-marketplace';
const VERSION_FILE_PREFIX = '.marketplace-version-';
const CHECK_MARKER_FILE = '.periodic-marketplace-check';
const LEGACY_URL_VERSION_PREFIX = 'url:';
const SIDECAR_VERSION_CACHE_FILE = '.marketplace-version';
const defaultLogger = { info: (message, ...rest) => console.info(`[BuiltinPluginMarketplaceUpdater] ${message}`, ...rest), warn: (message, ...rest) => console.warn(`[BuiltinPluginMarketplaceUpdater] ${message}`, ...rest), error: (message, ...rest) => console.error(`[BuiltinPluginMarketplaceUpdater] ${message}`, ...rest) };

class BuiltinPluginMarketplaceUpdater {
  constructor(options) { this.getMarketplaces = options.getMarketplaces; this.triggerMarketplaceUpdate = options.triggerMarketplaceUpdate; this.getInstallLocation = options.getInstallLocation; this.onUpdateCompleted = options.onUpdateCompleted; this.versionFileDir = options.versionFileDir; this.lockDir = options.lockDir ?? options.versionFileDir; this.legacyCleanupPaths = options.legacyCleanupPaths ?? []; this.updateIntervalMs = options.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS; this.lockStaleMs = options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS; this.versionCheckThrottleMs = options.versionCheckThrottleMs ?? DEFAULT_VERSION_CHECK_THROTTLE_MS; this.logger = options.logger ?? defaultLogger; this.initPromise = null; this.updateTimer = null; }
  initialize() { this.waitForReady().catch(() => {}); }
  async waitForReady() { if (!this.initPromise) { this.initPromise = this.doInitialize(); this.initPromise.catch((error) => this.logger.error('Background initialization failed:', error)); } return this.initPromise; }
  dispose() { if (this.updateTimer) clearInterval(this.updateTimer); this.updateTimer = null; this.initPromise = null; }
  async doInitialize() { try { this.logger.info('Starting background initialization...'); this.cleanupLegacyPaths(); await this.checkAndUpdate(); this.startUpdateTimer(); this.logger.info('Initialization completed'); } catch (error) { this.logger.error('Initialization error:', error); this.startUpdateTimer(); } }
  cleanupLegacyPaths() { for (const filePath of this.legacyCleanupPaths) try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); this.logger.info(`Removed legacy file: ${filePath}`); } } catch (error) { this.logger.warn(`Failed to remove legacy file '${filePath}':`, error); } }
  startUpdateTimer() { if (this.updateTimer || this.updateIntervalMs <= 0) return; this.updateTimer = setInterval(() => this.checkAndUpdate().catch((error) => this.logger.warn('Scheduled update check failed:', error)), this.updateIntervalMs); this.updateTimer.unref?.(); }
  async checkAndUpdate() { if (process.env.CODEBUDDY_SKIP_BUILTIN_MARKETPLACE || this.isRecentlyChecked() || !this.tryAcquireLock()) return; try { const marketplaces = await this.resolveMarketplaces(); if (marketplaces.length === 0) { this.touchCheckMarker(); return; } const updated = []; for (const config of marketplaces) try { if (await this.checkAndUpdateSingle(config)) updated.push(config.name); } catch (error) { this.logger.warn(`Failed to check marketplace '${config.name}':`, error); } if (updated.length) { this.logger.info(`${updated.length} marketplace(s) updated: ${updated.join(', ')}`); await this.onUpdateCompleted?.(updated).catch?.((error) => this.logger.warn('onUpdateCompleted callback failed:', error)); } this.touchCheckMarker(); } finally { this.releaseLock(); } }
  async checkAndUpdateSingle(config) { const { name, url } = config; if (!url) return false; const remoteVersion = this.parseVersionFromUrl(url); const localVersion = this.readCachedVersion(name); const installLocation = this.getInstallLocation?.(name); const exists = installLocation ? fs.existsSync(installLocation) : true; if (!exists || remoteVersion && localVersion !== remoteVersion) { if (!await this.triggerMarketplaceUpdate(name, { force: true })) return false; if (installLocation && !fs.existsSync(installLocation)) return false; this.commitInstalledVersion(name, installLocation, remoteVersion); return true; } if (!remoteVersion || localVersion === remoteVersion) this.touchVersionFile(name); return false; }
  async resolveMarketplaces() { try { return (await this.getMarketplaces() ?? []).filter((item) => !!item?.name); } catch (error) { this.logger.warn('Failed to resolve marketplaces:', error); return []; } }
  parseVersionFromUrl(url) { try { return url.match(/-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.zip/i)?.[1] ?? null; } catch { return null; } }
  readCachedVersion(name) { try { const filePath = this.getVersionFilePath(name); if (!fs.existsSync(filePath)) return null; const raw = fs.readFileSync(filePath, 'utf8').trim(); if (!raw || raw.startsWith(LEGACY_URL_VERSION_PREFIX)) { if (raw) fs.unlinkSync(filePath); return null; } return raw; } catch { return null; } }
  writeCachedVersion(name, version) { try { this.ensureDir(this.versionFileDir); fs.writeFileSync(this.getVersionFilePath(name), version, 'utf8'); } catch (error) { this.logger.warn(`Failed to write cached version for '${name}':`, error); } }
  commitInstalledVersion(name, installLocation, desktopVersion) { const sidecarVersion = this.readSidecarInstalledVersion(installLocation); if (!sidecarVersion) return; if (desktopVersion && sidecarVersion !== desktopVersion) this.logger.warn(`[${name}] sidecar installed version differs from desktop-parsed; using sidecar value`); this.writeCachedVersion(name, sidecarVersion); }
  readSidecarInstalledVersion(installLocation) { if (!installLocation) return null; try { const raw = fs.readFileSync(path.join(installLocation, SIDECAR_VERSION_CACHE_FILE), 'utf8').trim(); return raw && !raw.startsWith(LEGACY_URL_VERSION_PREFIX) ? raw : null; } catch { return null; } }
  touchVersionFile(name) { try { const filePath = this.getVersionFilePath(name); if (fs.existsSync(filePath)) { const now = new Date(); fs.utimesSync(filePath, now, now); } } catch {} }
  getVersionFilePath(name) { return path.join(this.versionFileDir, `${VERSION_FILE_PREFIX}${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`); }
  isRecentlyChecked() { try { return fs.existsSync(this.getCheckMarkerPath()) && Date.now() - fs.statSync(this.getCheckMarkerPath()).mtimeMs < this.versionCheckThrottleMs; } catch { return false; } }
  touchCheckMarker() { try { const filePath = this.getCheckMarkerPath(); this.ensureDir(this.versionFileDir); if (fs.existsSync(filePath)) { const now = new Date(); fs.utimesSync(filePath, now, now); } else fs.writeFileSync(filePath, '', 'utf8'); } catch {} }
  getCheckMarkerPath() { return path.join(this.versionFileDir, CHECK_MARKER_FILE); }
  tryAcquireLock() { this.ensureDir(this.lockDir); const lockFile = this.getLockFilePath(); try { if (fs.existsSync(lockFile)) { if (Date.now() - fs.statSync(lockFile).mtimeMs > this.lockStaleMs) fs.unlinkSync(lockFile); else return false; } fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, timestamp: Date.now(), hostname: os.hostname() }), { flag: 'wx' }); return true; } catch (error) { if (error?.code !== 'EEXIST') this.logger.warn('Failed to acquire lock:', error); return false; } }
  releaseLock() { try { const filePath = this.getLockFilePath(); if (JSON.parse(fs.readFileSync(filePath, 'utf8')).pid === process.pid) fs.unlinkSync(filePath); } catch {} }
  getLockFilePath() { return path.join(this.lockDir, `${LOCK_NAME}.lock`); }
  ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
}

module.exports = Object.freeze({ DEFAULT_UPDATE_INTERVAL_MS, DEFAULT_LOCK_STALE_MS, DEFAULT_VERSION_CHECK_THROTTLE_MS, LOCK_NAME, VERSION_FILE_PREFIX, CHECK_MARKER_FILE, LEGACY_URL_VERSION_PREFIX, SIDECAR_VERSION_CACHE_FILE, BuiltinPluginMarketplaceUpdater });
