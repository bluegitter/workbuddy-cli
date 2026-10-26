'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AuthenticationStoragePriority, getLogoutMarkerPath } = require('../common/authentication-protocol');
const { Subject } = require('../common/default-authentication-storage');

let authenticationConfigurationProvider = () => undefined;
let legacySessionMigrator;

function setWorkbuddyAuthenticationConfigurationProvider(provider) {
  authenticationConfigurationProvider = typeof provider === 'function' ? provider : () => undefined;
}

function getWorkbuddyAuthenticationConfiguration() {
  try { return authenticationConfigurationProvider(); } catch { return undefined; }
}

function setWorkbuddyLegacyAuthSessionMigrator(migrator) {
  legacySessionMigrator = migrator;
}

function defaultLogger(logger) {
  const target = logger || console;
  return {
    setContext: target.setContext?.bind(target) || (() => {}),
    info: target.info?.bind(target) || (() => {}),
    warn: target.warn?.bind(target) || (() => {}),
    error: target.error?.bind(target) || (() => {}),
  };
}

class FileAuthenticationStorage {
  static IS_WRITING_HOLD_MS = 300;
  static UNLINK_CONFIRM_DELAY_MS = 500;
  static WATCHER_RETRY_INITIAL_DELAY_MS = 250;
  static WATCHER_RETRY_MAX_DELAY_MS = 30000;
  static WATCHER_STABLE_RESET_MS = 30000;

  constructor({ filePath, filePathService, productManager, logger = console, watch = true } = {}) {
    this.filePath = filePath;
    this.filePathService = filePathService;
    this.productManager = productManager;
    this.logger = defaultLogger(logger);
    this.watchEnabled = watch;
    this.storeSessionSubject = new Subject();
    this.watcher = null;
    this.watcherRetryTimer = null;
    this.watcherStableTimer = null;
    this.watcherRetryDelayMs = FileAuthenticationStorage.WATCHER_RETRY_INITIAL_DELAY_MS;
    this.session = undefined;
    this.isWriting = false;
    this.isWritingTimer = null;
    this.pendingUnlinkTimer = null;
    this.pendingExternalReconcile = false;
    this.disposed = false;
  }

  async priority() { return AuthenticationStoragePriority.Normal + 1; }

  init() {
    this.logger.setContext('FileAuthenticationStorage');
    if (this.watchEnabled !== false) {
      this.initializeWatcher().catch((error) => {
        if (!this.disposed) this.logger.warn(`Failed to initialize watcher: ${error}`);
      });
    }
  }

  async getAuthSavePath() {
    if (this.filePath) return this.filePath;
    const config = getWorkbuddyAuthenticationConfiguration();
    const productConfig = this.productManager?.configuration?.getValue?.() || {};
    const authenticationId = config?.id || productConfig.authentication?.id || 'auth';
    const root = this.filePathService?.sharedDataPath || process.cwd();
    return path.join(root, 'auth', `${authenticationId}.info`);
  }

  async store(session, options = {}) {
    const filePath = await this.getAuthSavePath();
    if (this.disposed) return;
    const serializedSession = JSON.stringify(session, null, 2);
    let tempFile;
    try {
      this.beginWriting();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (options.preserveLogoutMarker && this.hasLogoutMarker(filePath)) {
        this.setSessionAndEmit(undefined);
        return;
      }
      tempFile = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tempFile, serializedSession, 'utf8');
      if (options.preserveLogoutMarker && this.hasLogoutMarker(filePath)) {
        this.setSessionAndEmit(undefined);
        return;
      }
      fs.renameSync(tempFile, filePath);
      tempFile = undefined;
      if (!options.preserveLogoutMarker) this.retireLogoutMarker(filePath);
      if (this.hasLogoutMarker(filePath)) {
        this.setSessionAndEmit(undefined);
        return;
      }
      if (!this.ensureSerializedSession(filePath, serializedSession) || this.hasLogoutMarker(filePath)) {
        await this.restore();
        return;
      }
      if (this.disposed) return;
      this.session = session;
      this.logger.info(`Stored auth session to file, userId: ${session?.account?.uid}`);
      this.emitSession(session);
    } catch (error) {
      this.logger.error(`Failed to store auth: ${error}`);
      throw error;
    } finally {
      if (tempFile) try { fs.unlinkSync(tempFile); } catch {}
      this.endWritingDeferred();
    }
  }

  async restore() {
    const filePath = await this.getAuthSavePath();
    if (this.disposed) return;
    try {
      if (this.hasLogoutMarker(filePath)) {
        this.logger.info('Auth logout marker found, ignoring stored session');
        this.setSessionAndEmit(undefined);
        return;
      }
      if (!fs.existsSync(filePath)) await this.migrateLegacySession();
      if (this.disposed) return;
      if (this.hasLogoutMarker(filePath)) {
        this.setSessionAndEmit(undefined);
        return;
      }
      if (!fs.existsSync(filePath)) {
        this.emitSession(undefined);
        return undefined;
      }
      this.session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.emitSession(this.session);
      return this.session;
    } catch (error) {
      if (!this.disposed) {
        this.logger.warn(`Failed to restore auth: ${error}`);
        this.setSessionAndEmit(undefined);
      }
      return undefined;
    }
  }

  async beginLogout() {
    const filePath = await this.getAuthSavePath();
    if (this.disposed) return undefined;
    const logoutToken = crypto.randomUUID();
    try {
      this.beginWriting();
      this.writeLogoutMarker(filePath, logoutToken);
      this.setSessionAndEmit(undefined);
      return logoutToken;
    } catch (error) {
      this.logger.warn(`Failed to publish logout marker: ${error}`);
      return undefined;
    } finally {
      this.endWritingDeferred();
    }
  }

  async clean(options = {}) {
    const filePath = await this.getAuthSavePath();
    if (this.disposed) return false;
    const logoutToken = options.logoutToken;
    if (logoutToken && !this.ownsLogoutMarker(filePath, logoutToken)) {
      await this.restore();
      return false;
    }
    let backupFile;
    let superseded = false;
    try {
      this.beginWriting();
      if (fs.existsSync(filePath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = path.extname(filePath);
        const basename = path.basename(filePath, ext);
        backupFile = path.join(path.dirname(filePath), `${basename}.${timestamp}.${process.pid}.${crypto.randomUUID()}${ext}`);
        fs.renameSync(filePath, backupFile);
      }
      if (logoutToken && !this.ownsLogoutMarker(filePath, logoutToken)) superseded = true;
      else if (!logoutToken) this.writeLogoutMarker(filePath);
    } catch (error) {
      this.logger.warn(`Failed to clean auth: ${error}`);
      superseded = true;
    } finally {
      this.endWritingDeferred();
    }
    if (superseded) {
      if (backupFile) try { this.restoreBackupIfAbsent(backupFile, filePath); } catch (error) { this.logger.warn(`Failed to restore auth backup: ${error}`); }
      await this.restore();
      return false;
    }
    this.setSessionAndEmit(undefined);
    return true;
  }

  async initializeWatcher() {
    if (this.disposed || this.watcher) return;
    try {
      const filePath = await this.getAuthSavePath();
      if (this.disposed || this.watcher) return;
      const directory = path.dirname(filePath);
      const filename = path.basename(filePath);
      const markerFilename = path.basename(getLogoutMarkerPath(filePath));
      fs.mkdirSync(directory, { recursive: true });
      const watcher = this.createDirectoryWatcher(directory, (_event, changedFilename) => {
        const changed = changedFilename == null ? null : String(changedFilename);
        if (changed !== null && changed !== filename && changed !== markerFilename) return;
        this.handleWatcherEvent();
      });
      watcher.on('error', (error) => {
        if (this.watcher !== watcher || this.disposed) return;
        this.logger.warn(`Watcher error: ${error}`);
        this.clearWatcherStableTimer();
        this.watcher = null;
        watcher.close();
        this.scheduleWatcherRetry();
      });
      watcher.on('close', () => {
        if (this.watcher !== watcher || this.disposed) return;
        this.logger.warn('Watcher closed unexpectedly');
        this.clearWatcherStableTimer();
        this.watcher = null;
        this.scheduleWatcherRetry();
      });
      this.watcher = watcher;
      this.scheduleWatcherStableReset(watcher);
      this.reconcileExternalState().catch((error) => this.logger.warn(`Failed to reconcile auth state: ${error}`));
    } catch (error) {
      if (!this.disposed) {
        this.logger.warn(`Failed to initialize watcher: ${error}`);
        this.scheduleWatcherRetry();
      }
    }
  }

  createDirectoryWatcher(directory, listener) { return fs.watch(directory, { encoding: 'utf8', persistent: false }, listener); }

  scheduleWatcherRetry() {
    if (this.disposed || this.watcherRetryTimer) return;
    const delay = this.watcherRetryDelayMs;
    this.watcherRetryDelayMs = Math.min(delay * 2, FileAuthenticationStorage.WATCHER_RETRY_MAX_DELAY_MS);
    this.watcherRetryTimer = setTimeout(() => {
      this.watcherRetryTimer = null;
      this.initializeWatcher().catch(() => {});
    }, delay);
    this.watcherRetryTimer.unref?.();
  }

  scheduleWatcherStableReset(watcher) {
    this.clearWatcherStableTimer();
    this.watcherStableTimer = setTimeout(() => {
      this.watcherStableTimer = null;
      if (this.watcher === watcher && !this.disposed) this.watcherRetryDelayMs = FileAuthenticationStorage.WATCHER_RETRY_INITIAL_DELAY_MS;
    }, FileAuthenticationStorage.WATCHER_STABLE_RESET_MS);
    this.watcherStableTimer.unref?.();
  }

  clearWatcherStableTimer() { if (this.watcherStableTimer) { clearTimeout(this.watcherStableTimer); this.watcherStableTimer = null; } }

  beginWriting() {
    if (this.disposed) return;
    this.isWriting = true;
    if (this.isWritingTimer) { clearTimeout(this.isWritingTimer); this.isWritingTimer = null; }
  }

  endWritingDeferred() {
    if (this.disposed) { this.isWriting = false; this.pendingExternalReconcile = false; return; }
    if (this.isWritingTimer) clearTimeout(this.isWritingTimer);
    this.isWritingTimer = setTimeout(() => {
      if (this.disposed) return;
      this.isWriting = false;
      this.isWritingTimer = null;
      if (this.pendingExternalReconcile) {
        this.pendingExternalReconcile = false;
        this.reconcileExternalState().catch((error) => this.logger.warn(`Failed to reconcile deferred auth change: ${error}`));
      }
    }, FileAuthenticationStorage.IS_WRITING_HOLD_MS);
    this.isWritingTimer.unref?.();
  }

  handleWatcherEvent() {
    if (this.disposed) return;
    if (this.isWriting) { this.pendingExternalReconcile = true; return; }
    this.reconcileExternalState().catch((error) => this.logger.warn(`Failed to reconcile external auth change: ${error}`));
  }

  async reconcileExternalState() {
    if (this.disposed) return;
    const filePath = await this.getAuthSavePath();
    if (this.hasLogoutMarker(filePath)) {
      if (this.pendingUnlinkTimer) { clearTimeout(this.pendingUnlinkTimer); this.pendingUnlinkTimer = null; }
      this.setSessionAndEmit(undefined);
    } else if (fs.existsSync(filePath)) await this.handleExternalChange();
    else this.handleUnlinkExternally(filePath);
  }

  handleUnlinkExternally(filePath) {
    if (this.disposed) return;
    if (this.pendingUnlinkTimer) clearTimeout(this.pendingUnlinkTimer);
    const timer = setTimeout(() => {
      if (this.disposed) return;
      if (this.pendingUnlinkTimer === timer) this.pendingUnlinkTimer = null;
      if (fs.existsSync(filePath)) return;
      if (this.hasLogoutMarker(filePath)) this.setSessionAndEmit(undefined);
    }, FileAuthenticationStorage.UNLINK_CONFIRM_DELAY_MS);
    timer.unref?.();
    this.pendingUnlinkTimer = timer;
  }

  async handleExternalChange() { if (!this.disposed) await this.restore(); }

  hasLogoutMarker(filePath) { return fs.existsSync(getLogoutMarkerPath(filePath)); }

  writeLogoutMarker(filePath, value = new Date().toISOString()) {
    const markerPath = getLogoutMarkerPath(filePath);
    const tempMarkerPath = `${markerPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    try { fs.writeFileSync(tempMarkerPath, value, 'utf8'); fs.renameSync(tempMarkerPath, markerPath); }
    finally { try { fs.unlinkSync(tempMarkerPath); } catch {} }
  }

  ownsLogoutMarker(filePath, token) { try { return fs.readFileSync(getLogoutMarkerPath(filePath), 'utf8') === token; } catch { return false; } }

  retireLogoutMarker(filePath) {
    const markerPath = getLogoutMarkerPath(filePath);
    const retiredPath = `${markerPath}.retired.${process.pid}.${crypto.randomUUID()}`;
    try { fs.renameSync(markerPath, retiredPath); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    try { fs.unlinkSync(retiredPath); } catch (error) { this.logger.warn(`Failed to clean retired logout marker: ${error}`); }
  }

  ensureSerializedSession(filePath, serializedSession) {
    try { return fs.readFileSync(filePath, 'utf8') === serializedSession; } catch (error) { if (error.code !== 'ENOENT') return false; }
    const recoveryPath = `${filePath}.recovery.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(recoveryPath, serializedSession, 'utf8');
      try { fs.linkSync(recoveryPath, filePath); } catch (error) {
        if (error.code !== 'EEXIST') {
          try { fs.copyFileSync(recoveryPath, filePath, fs.constants.COPYFILE_EXCL); } catch (copyError) { if (copyError.code !== 'EEXIST') return false; }
        }
      }
    } finally { try { fs.unlinkSync(recoveryPath); } catch {} }
    try { return fs.readFileSync(filePath, 'utf8') === serializedSession; } catch { return false; }
  }

  restoreBackupIfAbsent(backupFile, filePath) {
    try { fs.linkSync(backupFile, filePath); return; } catch (error) {
      if (error.code === 'EEXIST' || error.code === 'ENOENT') return;
      try { fs.copyFileSync(backupFile, filePath, fs.constants.COPYFILE_EXCL); } catch (copyError) { if (copyError.code !== 'EEXIST' && copyError.code !== 'ENOENT') throw copyError; }
    }
  }

  async migrateLegacySession() {
    if (!legacySessionMigrator) return;
    try {
      const session = await legacySessionMigrator.migrate?.();
      if (this.disposed || !session?.auth || !session?.account) return;
      if (session.auth.domain && !this.isSessionDomainMatchingCurrentEnv(session.auth.domain)) return;
      await this.store(session, { preserveLogoutMarker: true });
    } catch (error) { if (!this.disposed) this.logger.warn(`Failed to migrate legacy auth session: ${error}`); }
  }

  isSessionDomainMatchingCurrentEnv(sessionDomain) {
    const currentEndpoint = this.getCurrentExpectedEndpoint();
    if (!currentEndpoint) return true;
    try {
      const expected = new URL(currentEndpoint).hostname;
      const actual = sessionDomain.includes('://') ? new URL(sessionDomain).hostname : sessionDomain;
      return expected === actual;
    } catch { return currentEndpoint.includes(sessionDomain) || sessionDomain.includes(currentEndpoint); }
  }

  getCurrentExpectedEndpoint() {
    const authConfig = getWorkbuddyAuthenticationConfiguration();
    if (authConfig?.endpoint) return authConfig.endpoint;
    const productConfig = this.productManager?.configuration?.getValue?.();
    return productConfig?.authentication?.endpoint ?? productConfig?.endpoint;
  }

  async dispose() {
    this.disposed = true;
    this.isWriting = false;
    this.pendingExternalReconcile = false;
    for (const key of ['isWritingTimer', 'pendingUnlinkTimer', 'watcherRetryTimer']) {
      if (this[key]) clearTimeout(this[key]);
      this[key] = null;
    }
    this.clearWatcherStableTimer();
    this.watcher?.close();
    this.watcher = null;
  }

  setSessionAndEmit(session) { if (!this.disposed) { this.session = session; this.storeSessionSubject.next(session); } }
  emitSession(session) { if (!this.disposed) this.storeSessionSubject.next(session); }
}

module.exports = { FileAuthenticationStorage, getWorkbuddyAuthenticationConfiguration, setWorkbuddyAuthenticationConfigurationProvider, setWorkbuddyLegacyAuthSessionMigrator };
