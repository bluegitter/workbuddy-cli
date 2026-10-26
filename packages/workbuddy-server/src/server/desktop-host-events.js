'use strict';

const WORKBUDDY_APP_SERVER_HOST_EVENT_CHANNELS = Object.freeze({
  TASK_COMPLETED_NOTIFICATION: 'desktopHost:taskCompletedNotification',
});
const WORKBUDDY_APP_SERVER_HOST_RPC_CHANNELS = Object.freeze({
  OPEN_EXTERNAL: 'desktopHost:openExternal',
  OPEN_PATH: 'desktopHost:openPath',
  SHOW_ITEM_IN_FOLDER: 'desktopHost:showItemInFolder',
  COOKIE_GET: 'desktopHost:cookieGet',
  COOKIE_SET: 'desktopHost:cookieSet',
  COOKIE_REMOVE: 'desktopHost:cookieRemove',
  CLEAR_DEFAULT_SESSION_COOKIES_FOR_DOMAINS: 'desktopHost:clearDefaultSessionCookiesForDomains',
  RESOLVE_PROXY: 'desktopHost:resolveProxy',
  APPLY_PROXY_SETTINGS: 'desktopHost:applyProxySettings',
  DECRYPT_LEGACY_AUTH_SESSION: 'desktopHost:decryptLegacyAuthSession',
  SHOW_OPEN_DIALOG: 'desktopHost:showOpenDialog',
  SHOW_SAVE_DIALOG: 'desktopHost:showSaveDialog',
  SHOW_MESSAGE_BOX: 'desktopHost:showMessageBox',
  TENCENT_DOCS_ENGINE_ORIGIN_CHANGED: 'desktopHost:tencentDocsEngineOriginChanged',
  MONITOR_REPORT_METRIC: 'desktopHost:monitorReportMetric',
  MONITOR_REPORT_PROMPT_FORWARDING: 'desktopHost:monitorReportPromptForwarding',
  MONITOR_REPORT_PROMPT_DONE: 'desktopHost:monitorReportPromptDone',
  MONITOR_REPORT_PROMPT_TRACE: 'desktopHost:monitorReportPromptTrace',
  MONITOR_APPLY_RENDERER_SESSION_ID: 'desktopHost:monitorApplyRendererSessionId',
  DOCS_GET_PREVIEW_URL: 'desktopHost:docsGetPreviewUrl',
});

function isWorkbuddyAppServerHostDocsGetPreviewUrlParams(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.filePath === 'string' && value.filePath.length > 0 && isTencentDocsPreviewUrlOptions(value.options);
}
function isTencentDocsPreviewUrlOptions(value) {
  return value === undefined || (!!value && typeof value === 'object' && !Array.isArray(value) &&
    (value.mode === undefined || value.mode === 'edit' || value.mode === 'readonly'));
}
function isMonitorMetricPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.kind === 'duration' || value.kind === 'counter') {
    return typeof value.metric === 'string' && value.metric.length > 0 && typeof value.value === 'number' &&
      Number.isFinite(value.value) && (value.dims === undefined || isRecord(value.dims));
  }
  return value.kind === 'event' && typeof value.name === 'string' && value.name.length > 0 &&
    (value.ext === undefined || isRecord(value.ext));
}
function isWorkbuddyAppServerTaskCompletedNotificationPayload(value) {
  return !!value && typeof value === 'object' && typeof value.sessionId === 'string' && value.sessionId.length > 0 &&
    typeof value.taskTitle === 'string';
}
function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function readDialogRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}
function readOptionalString(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${label} must be a string when provided`);
  return value;
}
function readOptionalInteger(value, label) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer when provided`);
  return value;
}
function readOptionalBoolean(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean when provided`);
  return value;
}
function readOptionalDialogFilters(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array when provided`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${label}[${index}] must be an object`);
    if (typeof item.name !== 'string' || !item.name) throw new Error(`${label}[${index}].name must be a non-empty string`);
    if (!Array.isArray(item.extensions) || !item.extensions.every((ext) => typeof ext === 'string')) {
      throw new Error(`${label}[${index}].extensions must be string[]`);
    }
    return { name: item.name, extensions: item.extensions };
  });
}
const OPEN_DIALOG_PROPERTIES = Object.freeze(['openFile', 'openDirectory', 'multiSelections', 'createDirectory']);
function readOptionalOpenDialogProperties(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('showOpenDialog params.properties must be an array when provided');
  return value.map((item, index) => {
    if (!OPEN_DIALOG_PROPERTIES.includes(item)) throw new Error(`showOpenDialog params.properties[${index}] must be one of ${OPEN_DIALOG_PROPERTIES.join('|')}; got ${String(item)}`);
    return item;
  });
}
function readShowOpenDialogParams(value) {
  const params = readDialogRecord(value, 'showOpenDialog params');
  return { title: readOptionalString(params.title, 'showOpenDialog params.title'), defaultPath: readOptionalString(params.defaultPath, 'showOpenDialog params.defaultPath'), filters: readOptionalDialogFilters(params.filters, 'showOpenDialog params.filters'), properties: readOptionalOpenDialogProperties(params.properties) };
}
function readShowSaveDialogParams(value) {
  const params = readDialogRecord(value, 'showSaveDialog params');
  return { title: readOptionalString(params.title, 'showSaveDialog params.title'), defaultPath: readOptionalString(params.defaultPath, 'showSaveDialog params.defaultPath'), filters: readOptionalDialogFilters(params.filters, 'showSaveDialog params.filters') };
}
function readShowMessageBoxParams(value) {
  const params = readDialogRecord(value, 'showMessageBox params');
  if (typeof params.message !== 'string' || !params.message.trim()) throw new Error('showMessageBox params.message must be a non-empty string');
  if (params.buttons !== undefined && (!Array.isArray(params.buttons) || !params.buttons.every((item) => typeof item === 'string'))) throw new Error('showMessageBox params.buttons must be string[]');
  if (params.type !== undefined && !['none', 'info', 'error', 'warning'].includes(params.type)) throw new Error(`showMessageBox params.type must be one of 'none'|'info'|'error'|'warning'; got ${String(params.type)}`);
  return { type: params.type, title: readOptionalString(params.title, 'showMessageBox params.title'), message: params.message, detail: readOptionalString(params.detail, 'showMessageBox params.detail'), buttons: params.buttons, defaultId: readOptionalInteger(params.defaultId, 'showMessageBox params.defaultId'), cancelId: readOptionalInteger(params.cancelId, 'showMessageBox params.cancelId'), noLink: readOptionalBoolean(params.noLink, 'showMessageBox params.noLink') };
}
function readTencentDocsEngineOriginChangedParams(value) {
  const origin = readOptionalString(readDialogRecord(value, 'tencentDocsEngineOriginChanged params').origin, 'tencentDocsEngineOriginChanged params.origin');
  return origin ? { origin } : {};
}

module.exports = Object.freeze({ WORKBUDDY_APP_SERVER_HOST_EVENT_CHANNELS, WORKBUDDY_APP_SERVER_HOST_RPC_CHANNELS, isWorkbuddyAppServerHostDocsGetPreviewUrlParams, isTencentDocsPreviewUrlOptions, isMonitorMetricPayload, isWorkbuddyAppServerTaskCompletedNotificationPayload, readShowOpenDialogParams, readShowSaveDialogParams, readShowMessageBoxParams, readTencentDocsEngineOriginChangedParams, OPEN_DIALOG_PROPERTIES });
