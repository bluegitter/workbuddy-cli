'use strict';

const RENDERER_SERVICE_NAME = 'workbuddy-renderer';
const RENDERER_SERVICE_VERSION = '1.0.0';
const TARGET_VALUE = 'ElectronApp.WorkBuddy.Desktop';
const CONTAINER_NAME_VALUE = 'genie.workbuddy-renderer';
const IDE_TYPE_VALUE = 'workbuddy-renderer';

function detectDevEnv() {
  try { if (typeof globalThis.__DEV__ === 'boolean') return globalThis.__DEV__; } catch {}
  try { const state = JSON.parse(globalThis.localStorage?.getItem('__dev_env_state__') || 'null'); return Boolean(state?.enabled && (state.env === 'staging' || state.env === 'dev')); } catch { return false; }
}
function detectOsPlatform() { try { return globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || 'unknown'; } catch { return 'unknown'; } }
function buildRendererResourceAttributes(options = {}) {
  const isDev = detectDevEnv();
  const attrs = { 'service.name': RENDERER_SERVICE_NAME, 'service.version': options.appVersion || RENDERER_SERVICE_VERSION, target: TARGET_VALUE, type: 'resource', env_name: isDev ? 'development' : 'production', namespace: isDev ? 'Development' : 'Production', container_name: CONTAINER_NAME_VALUE, ideType: IDE_TYPE_VALUE, instance: `renderer-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`, os: detectOsPlatform() };
  if (options.userId) attrs.uid = options.userId;
  return attrs;
}

module.exports = Object.freeze({ RENDERER_SERVICE_NAME, RENDERER_SERVICE_VERSION, TARGET_VALUE, CONTAINER_NAME_VALUE, IDE_TYPE_VALUE, detectDevEnv, detectOsPlatform, buildRendererResourceAttributes });
