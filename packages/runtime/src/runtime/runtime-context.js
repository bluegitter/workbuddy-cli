'use strict';

const os = require('os');
const path = require('path');

const DEFAULT_APP_NAME = 'WorkBuddy';
const DEFAULT_CONFIG_DIRNAME = '.workbuddy';
let configured = {};

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, entry]) => entry !== undefined));
}

function configureWorkbuddyRuntimeContext(options = {}) {
  configured = { ...configured, ...dropUndefined(options) };
  return { ...configured };
}

function envOr(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function getWorkbuddyRuntimeAppName() { return envOr('WORKBUDDY_APP_NAME', configured.appName || DEFAULT_APP_NAME); }
function getWorkbuddyRuntimeAppVersion() { return envOr('WORKBUDDY_APP_VERSION', configured.appVersion || ''); }
function getWorkbuddyRuntimeAppPath() { return envOr('WORKBUDDY_APP_PATH', configured.appPath || process.cwd()); }
function getWorkbuddyRuntimePromptTemplatesDir() { return envOr('WORKBUDDY_PROMPT_TEMPLATES_DIR', configured.promptTemplatesDir); }
function getWorkbuddyRuntimeLocale() { return envOr('WORKBUDDY_LOCALE', configured.locale || process.env.LANG || 'en'); }
function getWorkbuddyRuntimeConfigDir() {
  return envOr('WORKBUDDY_CONFIG_DIR', configured.configDir || path.join(os.homedir(), DEFAULT_CONFIG_DIRNAME));
}
function getWorkbuddyRuntimeUserDataDir() {
  return envOr('WORKBUDDY_USER_DATA_DIR', configured.userDataDir || path.join(getWorkbuddyRuntimeConfigDir(), 'app'));
}
function getWorkbuddyRuntimeLogsDir(...segments) {
  return path.join(getWorkbuddyRuntimeConfigDir(), 'logs', ...segments);
}

module.exports = {
  configureWorkbuddyRuntimeContext,
  getWorkbuddyRuntimeAppName,
  getWorkbuddyRuntimeAppVersion,
  getWorkbuddyRuntimeAppPath,
  getWorkbuddyRuntimePromptTemplatesDir,
  getWorkbuddyRuntimeLocale,
  getWorkbuddyRuntimeConfigDir,
  getWorkbuddyRuntimeUserDataDir,
  getWorkbuddyRuntimeLogsDir,
};
