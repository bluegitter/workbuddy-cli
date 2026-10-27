'use strict';

const { AuthenticationStoragePriority } = require('../../../authentication/src/common/authentication-protocol');

const ACC_PRODUCT_CONFIG_ENV_KEYS = ['ACC_PRODUCT_CONFIG_V3', 'ACC_PRODUCT_CONFIG_V2'];
const BOOTSTRAP_FILE_STORAGE_PRIORITY = AuthenticationStoragePriority.Heigh + 2;

class WorkbuddyBootstrapAuthenticationStorage {
  constructor({ fileAuthenticationStorage, readProductConfig = (key) => process.env[key] } = {}) {
    this.fileAuthenticationStorage = fileAuthenticationStorage;
    this.readProductConfig = readProductConfig;
  }
  get storeSessionSubject() { return this.fileAuthenticationStorage?.storeSessionSubject; }
  async priority() {
    const type = this.getBootstrapAuthenticationType();
    if (!type || type === 'custom-token') return AuthenticationStoragePriority.Disabled;
    return BOOTSTRAP_FILE_STORAGE_PRIORITY;
  }
  async store(session, options) { return this.fileAuthenticationStorage.store(session, options); }
  async restore() { return this.fileAuthenticationStorage.restore(); }
  async beginLogout() { return this.fileAuthenticationStorage.beginLogout(); }
  async clean(options) { return this.fileAuthenticationStorage.clean(options); }
  getBootstrapAuthenticationType() {
    for (const key of ACC_PRODUCT_CONFIG_ENV_KEYS) {
      const raw = this.readProductConfig(key);
      if (!raw) continue;
      try { const type = JSON.parse(raw)?.authentication?.type; if (type) return type; } catch {}
    }
    return undefined;
  }
}

module.exports = { WorkbuddyBootstrapAuthenticationStorage, ACC_PRODUCT_CONFIG_ENV_KEYS, BOOTSTRAP_FILE_STORAGE_PRIORITY };
