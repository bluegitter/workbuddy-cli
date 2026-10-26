'use strict';
const { AuditLogStore } = require('./audit-log-store');
const { sandboxRulesAuditMessage } = require('./audit-message');

class WorkbuddySecurityCenterService {
  constructor(deps = {}) { this.deps = deps; this.auditLog = deps.auditLog || new AuditLogStore({ configDir: deps.configDir || process.cwd() }); this.sandboxRules = deps.sandboxRules || {}; this.sandboxSafetyEnabled = deps.sandboxSafetyEnabled ?? true; }
  async initialize() { await this.auditLog.initialize(); return this; }
  async getState() { return { sandboxRules: this.sandboxRules, sandboxSafetyEnabled: this.sandboxSafetyEnabled, auditLog: await this.auditLog.query({ limit: 1 }) }; }
  async saveSandboxRulesConfig(payload) { this.sandboxRules = payload ?? {}; await this.auditLog.append({ source: 'desktop-main', category: 'config', eventType: 'security.sandboxRules.updated', decision: 'info', ...sandboxRulesAuditMessage('sandboxRules', payload) }); return this.sandboxRules; }
  async saveSandboxSafetyEnabled(payload) { this.sandboxSafetyEnabled = typeof payload === 'boolean' ? payload : payload?.enabled !== false; await this.auditLog.append({ source: 'desktop-main', category: 'config', eventType: 'security.sandboxSafety.updated', decision: 'info', messageKey: `securityCenter.audit.config.sandboxSafety${this.sandboxSafetyEnabled ? 'Enabled' : 'Disabled'}`, messageParams: {} }); return { enabled: this.sandboxSafetyEnabled }; }
  async clearAuditLog() { await this.auditLog.clear(); return { success: true }; }
  queryAuditLog(payload) { return this.auditLog.query(payload); }
  async exportAuditLog() { return this.auditLog.query({ limit: Number.MAX_SAFE_INTEGER }); }
  async saveExperimentalFeaturesConfig(payload) { this.experimentalFeatures = payload ?? {}; return this.experimentalFeatures; }
  getExperimentalFeaturesConfig() { return this.experimentalFeatures || {}; }
  async openModifyBackupDir() { return { success: false, error: 'not_supported' }; }
  drainSpoolOnStartup() { return Promise.resolve(); }
  startSpoolDrainTimer() { return undefined; }
}
function createWorkbuddySecurityCenterService(deps) { return new WorkbuddySecurityCenterService(deps); }
module.exports = Object.freeze({ WorkbuddySecurityCenterService, createWorkbuddySecurityCenterService });
