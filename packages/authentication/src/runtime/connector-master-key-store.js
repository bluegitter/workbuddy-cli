'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { enforceDirAcl, enforceFileAcl, verifyFileAcl, tryRepairAcl } = require('./oauth-acl');

const KEY_BYTES = 32;
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const PRIMARY_FILE_NAME = '.master.key';
const BACKUP_DIR_NAME = 'connector-keys';

function hashUserId(userId) { return crypto.createHash('sha256').update(userId, 'utf8').digest('hex').slice(0, 32); }

class ConnectorOAuthMasterKeyStore {
  constructor(options = {}) {
    if (!options.userId) throw new Error('MasterKeyStore: userId is required');
    if (options.userId === 'default') throw new Error('MasterKeyStore: refuse to operate with userId="default" (not signed in)');
    const primaryDir = options.primaryDir ?? path.join(os.homedir(), '.workbuddy', 'connectors', options.userId);
    const backupBaseDir = options.backupBaseDir ?? path.join(os.homedir(), '.workbuddy-key-fallback');
    this.primaryPath = path.join(primaryDir, PRIMARY_FILE_NAME);
    this.backupPath = path.join(backupBaseDir, BACKUP_DIR_NAME, `${hashUserId(options.userId)}.key`);
    this.acl = options.acl || {
      enforceDir: enforceDirAcl,
      enforceFile: enforceFileAcl,
      verifyFile: (filePath) => {
        const initial = verifyFileAcl(filePath);
        if (initial.ok) return true;
        return initial.recoverable && tryRepairAcl(filePath, 'file') && verifyFileAcl(filePath).ok;
      },
    };
  }

  getPrimaryPath() { return this.primaryPath; }
  getBackupPath() { return this.backupPath; }

  getExisting() {
    const primary = this.tryReadKey(this.primaryPath);
    const backup = this.tryReadKey(this.backupPath);
    if (!primary && !backup) return undefined;
    if (primary && !backup) {
      this.tryWriteKey(this.backupPath, primary);
      return { key: primary, diagnostics: this.buildDiag('recovered-backup-from-primary') };
    }
    if (!primary && backup) {
      this.tryWriteKey(this.primaryPath, backup);
      return { key: backup, diagnostics: this.buildDiag('recovered-primary-from-backup') };
    }
    if (primary.equals(backup)) return { key: primary, diagnostics: this.buildDiag('loaded-from-primary') };
    this.tryWriteKey(this.backupPath, primary);
    return { key: primary, diagnostics: this.buildDiag('mismatch-primary-wins') };
  }

  getOrCreate() {
    const existing = this.getExisting();
    if (existing) return existing;
    const key = crypto.randomBytes(KEY_BYTES);
    this.tryWriteKey(this.primaryPath, key);
    this.tryWriteKey(this.backupPath, key);
    this.ensureReadme();
    return { key, diagnostics: this.buildDiag('created') };
  }

  clear() {
    for (const filePath of [this.primaryPath, this.backupPath]) {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    }
  }

  buildDiag(action) {
    return { primaryPath: this.primaryPath, backupPath: this.backupPath, primaryExists: fs.existsSync(this.primaryPath), backupExists: fs.existsSync(this.backupPath), action };
  }

  ensureReadme() {
    const filePath = path.join(path.dirname(this.primaryPath), 'README-DO-NOT-DELETE.txt');
    if (fs.existsSync(filePath)) return;
    try {
      fs.writeFileSync(filePath, 'WorkBuddy Connector Credentials\nDo not delete .master.key separately.\n', { mode: FILE_MODE, flag: 'wx' });
      fs.chmodSync(filePath, FILE_MODE);
    } catch {}
  }

  tryReadKey(filePath) {
    if (!fs.existsSync(filePath)) return undefined;
    if (this.acl.verifyFile && !this.acl.verifyFile(filePath)) return undefined;
    try {
      const key = fs.readFileSync(filePath);
      return key.length === KEY_BYTES ? key : undefined;
    } catch { return undefined; }
  }

  tryWriteKey(filePath, key) {
    if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) return false;
    const dir = path.dirname(filePath);
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
      fs.chmodSync(dir, DIR_MODE);
      this.acl.enforceDir?.(dir);
      const fd = fs.openSync(tempPath, 'wx', FILE_MODE);
      try { fs.writeSync(fd, key); fs.fchmodSync(fd, FILE_MODE); } finally { fs.closeSync(fd); }
      fs.renameSync(tempPath, filePath);
      fs.chmodSync(filePath, FILE_MODE);
      this.acl.enforceFile?.(filePath);
      return true;
    } catch {
      try { fs.rmSync(tempPath, { force: true }); } catch {}
      return false;
    }
  }
}

module.exports = Object.freeze({ KEY_BYTES, FILE_MODE, DIR_MODE, PRIMARY_FILE_NAME, BACKUP_DIR_NAME, ConnectorOAuthMasterKeyStore, hashUserId });
