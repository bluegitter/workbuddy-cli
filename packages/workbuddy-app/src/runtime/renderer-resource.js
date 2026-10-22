'use strict';

const RENDERER_SERVICE_NAME = 'workbuddy-renderer';
const RENDERER_SERVICE_VERSION = '1.0.0';
const TARGET_VALUE = 'ElectronApp.WorkBuddy.Desktop';
const CONTAINER_NAME_VALUE = 'genie.workbuddy-renderer';
const IDE_TYPE_VALUE = 'workbuddy-renderer';

function detectDevEnv({ globalObject = globalThis, storage } = {}) {
  if (typeof globalObject.__DEV__ === 'boolean') return globalObject.__DEV__;
  try { const raw = (storage || globalObject.localStorage)?.getItem('__dev_env_state__'); const state = raw && JSON.parse(raw); return Boolean(state?.enabled && (state.env === 'staging' || state.env === 'dev')); } catch { return false; }
}
function detectOsPlatform(navigatorObject = globalThis.navigator) { return navigatorObject?.userAgentData?.platform || navigatorObject?.platform || 'unknown'; }
function buildRendererResourceAttributes(options = {}) {
  const isDev = options.isDev ?? detectDevEnv(options); const random = options.random || Math.random; const now = options.now || Date.now;
  return { 'service.name': RENDERER_SERVICE_NAME, 'service.version': options.appVersion || RENDERER_SERVICE_VERSION, target: TARGET_VALUE, type: 'resource', env_name: isDev ? 'development' : 'production', namespace: isDev ? 'Development' : 'Production', container_name: CONTAINER_NAME_VALUE, ideType: IDE_TYPE_VALUE, instance: `renderer-${random().toString(36).slice(2, 10)}-${now()}`, os: options.os || detectOsPlatform(options.navigatorObject), ...(options.userId ? { uid: options.userId } : {}) };
}
function normalizeTheme(theme) { return theme === 'dark' || theme === 'light' ? theme : 'light'; }
function normalizeLanguage(locale) { return String(locale || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'; }
module.exports = Object.freeze({ CONTAINER_NAME_VALUE, IDE_TYPE_VALUE, RENDERER_SERVICE_NAME, RENDERER_SERVICE_VERSION, TARGET_VALUE, buildRendererResourceAttributes, detectDevEnv, detectOsPlatform, normalizeLanguage, normalizeTheme });
