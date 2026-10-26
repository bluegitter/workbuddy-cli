'use strict';
const { createWorkbuddySecurityCenterService } = require('./service');
function registerSecurityCenterHandlers(registry, deps) {
  const service = deps.service || createWorkbuddySecurityCenterService(deps);
  const methods = { securityCenterGetState: () => service.getState(), securityCenterSaveSandboxRulesConfig: (payload) => service.saveSandboxRulesConfig(payload), securityCenterSaveSandboxSafetyEnabled: (payload) => service.saveSandboxSafetyEnabled(payload), securityCenterClearAuditLog: () => service.clearAuditLog(), securityCenterQueryAuditLog: (payload) => service.queryAuditLog(payload), securityCenterExportAuditLog: () => service.exportAuditLog(), securityCenterSaveExperimentalFeaturesConfig: (payload) => service.saveExperimentalFeaturesConfig(payload), securityCenterGetExperimentalFeaturesConfig: () => service.getExperimentalFeaturesConfig(), securityCenterOpenModifyBackupDir: (payload) => service.openModifyBackupDir(typeof payload === 'string' ? payload : '') };
  for (const [name, handler] of Object.entries(methods)) registry.handle(name, handler);
  service.drainSpoolOnStartup().catch(() => {}); service.startSpoolDrainTimer(); return service;
}
module.exports = Object.freeze({ registerSecurityCenterHandlers });
