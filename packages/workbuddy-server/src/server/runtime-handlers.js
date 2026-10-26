'use strict';

function registerWorkbuddyMainRuntimeHandlers(endpoint, deps) {
  const disposeMigrationRuntimeHandlers = deps.registerMigrationRuntimeHandlers?.(endpoint, deps.migration) ?? (() => {});
  if (deps.imaUploadProgress) deps.registerImaUploadProgressEventBridge?.(endpoint, deps.imaUploadProgress);
  return () => disposeMigrationRuntimeHandlers();
}
function registerWorkbuddyBackgroundRuntimeHandlers(endpoint, deps) {
  if (deps.automation) deps.registerAutomationEventBridge?.(endpoint, deps.automation);
  if (deps.cloudStudioDeploy) deps.registerCloudStudioDeployHandlers?.(endpoint, deps.cloudStudioDeploy);
  if (deps.imaUploadProgress) deps.registerImaUploadProgressEventBridge?.(endpoint, deps.imaUploadProgress);
}

module.exports = Object.freeze({ registerWorkbuddyMainRuntimeHandlers, registerWorkbuddyBackgroundRuntimeHandlers });
