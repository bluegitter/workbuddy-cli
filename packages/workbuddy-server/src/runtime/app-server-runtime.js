'use strict';

function assertWorkbuddyAppServerStdioMode(argv) { if (!argv.includes('--stdio')) throw new Error('Missing --stdio'); }
function readBooleanEnv(value) { const normalized = String(value || '').trim().toLowerCase(); return normalized === '1' || normalized === 'true' || normalized === 'yes'; }
function createNoopWorkbuddyAppServerWindowManager() { return { broadcast() {} }; }
function createWorkbuddyAppServerPlatformFromEnv(options = {}) {
  const processEnv = options.processEnv || process.env;
  const execPath = options.execPath || process.execPath;
  const resourcesPath = processEnv.WORKBUDDY_RESOURCES_PATH?.trim() || options.processResourcesPath || require('path').dirname(execPath);
  const runtime = options.runtime || {};
  const unavailable = async () => { throw new Error('WorkBuddy app-server platform operation is unavailable; use DesktopHost IPC bridge'); };
  return { appRootPath: runtime.appRootPath, resourcesPath, dataDir: runtime.dataDir, configDir: runtime.configDir, isPackaged: readBooleanEnv(processEnv.WORKBUDDY_IS_PACKAGED), appVersion: runtime.appVersion || '0.0.0', osPlatform: options.osPlatform || process.platform, appLocale: () => runtime.locale, openExternal: unavailable, openPath: unavailable, showItemInFolder: unavailable, showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }), showMessageBox: async () => ({ response: 0 }), readClipboard: () => '' };
}

module.exports = Object.freeze({ assertWorkbuddyAppServerStdioMode, readBooleanEnv, createNoopWorkbuddyAppServerWindowManager, createWorkbuddyAppServerPlatformFromEnv });
