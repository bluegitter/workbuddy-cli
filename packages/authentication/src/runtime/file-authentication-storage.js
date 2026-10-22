'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AuthenticationStoragePriority, getLogoutMarkerPath } = require('./authentication-protocol');
const { Subject } = require('./default-authentication-storage');

let authenticationConfigurationProvider = () => undefined;
let legacySessionMigrator;
function setWorkbuddyAuthenticationConfigurationProvider(provider) { authenticationConfigurationProvider = typeof provider === 'function' ? provider : () => undefined; }
function getWorkbuddyAuthenticationConfiguration() { try { return authenticationConfigurationProvider(); } catch { return undefined; } }
function setWorkbuddyLegacyAuthSessionMigrator(migrator) { legacySessionMigrator = migrator; }

class FileAuthenticationStorage {
  static IS_WRITING_HOLD_MS = 300;
  constructor({ filePath, filePathService, productManager, logger = console, watch = false } = {}) {
    this.filePath = filePath;
    this.filePathService = filePathService;
    this.productManager = productManager;
    this.logger = logger;
    this.watchEnabled = watch;
    this.storeSessionSubject = new Subject();
    this.session = undefined;
    this.disposed = false;
    this.isWriting = false;
    this.watcher = null;
  }

  async priority() { return AuthenticationStoragePriority.Normal + 1; }
  async init() { if (this.watchEnabled) await this.initializeWatcher(); }
  async getAuthSavePath() {
    if (this.filePath) return this.filePath;
    const config = getWorkbuddyAuthenticationConfiguration();
    const authenticationId = config?.id || this.productManager?.configuration?.getValue?.()?.authentication?.id || 'auth';
    const root = this.filePathService?.sharedDataPath || process.cwd();
    return path.join(root, 'auth', `${authenticationId}.info`);
  }
  async store(session, options = {}) {
    const filePath = await this.getAuthSavePath(); if (this.disposed) return;
    if (options.preserveLogoutMarker && this.hasLogoutMarker(filePath)) { this.setSessionAndEmit(undefined); return; }
    const serialized = JSON.stringify(session, null, 2);
    this.isWriting = true;
    const temp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(temp, serialized, 'utf8');
      if (options.preserveLogoutMarker && this.hasLogoutMarker(filePath)) { this.setSessionAndEmit(undefined); return; }
      fs.renameSync(temp, filePath);
      if (!options.preserveLogoutMarker) this.retireLogoutMarker(filePath);
      if (this.hasLogoutMarker(filePath)) { this.setSessionAndEmit(undefined); return; }
      this.session = session;
      this.emitSession(session);
    } finally {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
      this.deferWritingEnd();
    }
  }
  async restore() {
    const filePath = await this.getAuthSavePath(); if (this.disposed) return;
    if (this.hasLogoutMarker(filePath)) { this.setSessionAndEmit(undefined); return; }
    if (!fs.existsSync(filePath) && legacySessionMigrator) {
      const migrated = await legacySessionMigrator.migrate?.();
      if (migrated?.account && migrated?.auth) await this.store(migrated, { preserveLogoutMarker: true });
    }
    if (this.hasLogoutMarker(filePath) || !fs.existsSync(filePath)) { this.emitSession(undefined); return undefined; }
    try { this.session = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { this.session = undefined; }
    this.emitSession(this.session);
    return this.session;
  }
  async beginLogout() {
    const filePath = await this.getAuthSavePath(); if (this.disposed) return undefined;
    const token = crypto.randomUUID(); this.writeLogoutMarker(filePath, token); this.setSessionAndEmit(undefined); return token;
  }
  async clean(options = {}) {
    const filePath = await this.getAuthSavePath(); if (this.disposed) return false;
    if (options.logoutToken && !this.ownsLogoutMarker(filePath, options.logoutToken)) { await this.restore(); return false; }
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath); const base = path.basename(filePath, ext);
      const backup = path.join(path.dirname(filePath), `${base}.${new Date().toISOString().replace(/[:.]/g, '-')}.${process.pid}.${crypto.randomUUID()}${ext}`);
      fs.renameSync(filePath, backup);
    }
    if (!options.logoutToken) this.writeLogoutMarker(filePath);
    this.setSessionAndEmit(undefined); return true;
  }
  hasLogoutMarker(filePath) { return fs.existsSync(getLogoutMarkerPath(filePath)); }
  writeLogoutMarker(filePath, value = new Date().toISOString()) {
    const marker = getLogoutMarkerPath(filePath); const temp = `${marker}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    try { fs.writeFileSync(temp, value, 'utf8'); fs.renameSync(temp, marker); } finally { try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {} }
  }
  ownsLogoutMarker(filePath, token) { try { return fs.readFileSync(getLogoutMarkerPath(filePath), 'utf8') === token; } catch { return false; } }
  retireLogoutMarker(filePath) { const marker = getLogoutMarkerPath(filePath); try { fs.unlinkSync(marker); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  deferWritingEnd() { const timer = setTimeout(() => { this.isWriting = false; }, FileAuthenticationStorage.IS_WRITING_HOLD_MS); timer.unref?.(); }
  setSessionAndEmit(session) { if (this.disposed) return; this.session = session; this.storeSessionSubject.next(session); }
  emitSession(session) { if (!this.disposed) this.storeSessionSubject.next(session); }
  async initializeWatcher() {
    const filePath = await this.getAuthSavePath(); fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.watcher = fs.watch(path.dirname(filePath), (_event, changed) => { if (!changed || changed.toString() === path.basename(filePath)) this.restore().catch(() => {}); });
  }
  async dispose() { this.disposed = true; this.watcher?.close(); this.watcher = null; }
}

module.exports = { FileAuthenticationStorage, getWorkbuddyAuthenticationConfiguration, setWorkbuddyAuthenticationConfigurationProvider, setWorkbuddyLegacyAuthSessionMigrator };
