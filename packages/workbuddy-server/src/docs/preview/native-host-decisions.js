'use strict';

const path = require('node:path');
const { buildLocalDocumentDirtyCloseChoices } = require('../save/local-document-save');
const { formatLocalPreviewText } = require('../save/local-preview-text');
const defaultRequestSaveAsPath = async () => undefined;

function createNativeHostDirtyEditorCloseDecision(platform, deps = {}) { return (context) => requestNativeHostDirtyEditorCloseDecision(context, platform, deps); }
function createNativeHostOriginalFileConflictDecision(platform, deps = {}) { return (context) => requestNativeHostOriginalFileConflictDecision(context, platform, deps); }
function createNativeHostOriginalFileChangedNotifier(platform, deps = {}) { return (notification) => notifyNativeHostOriginalFileChanged(notification, platform, deps); }
async function requestNativeHostDirtyEditorCloseDecision(context, platform, deps = {}) {
  const translate = deps.formatText || ((key, values) => formatLocalPreviewText(key, values, deps));
  const title = context.title || path.basename(context.filePath); const allowCancel = context.source !== 'open-eviction';
  const writeAccess = await (deps.getLocalDocumentWriteAccess || (async () => ({ writable: true })))(context.filePath);
  while (true) {
    const buttons = buildLocalDocumentDirtyCloseChoices({ isDarwin: platform.osPlatform === 'darwin', canSaveOriginal: writeAccess.writable, labels: { saveButton: translate('saveButton'), saveAsButton: translate('saveAsButton'), cancelButton: translate('cancelButton'), discardButton: translate('discardButton') } }).filter((item) => allowCancel || item.action !== 'cancel');
    const defaultAction = writeAccess.writable ? 'save' : 'saveAs'; const defaultId = buttons.findIndex((item) => item.action === defaultAction); const cancelId = buttons.findIndex((item) => item.action === 'cancel');
    const action = buttons[(await platform.showMessageBox({ type: 'warning', buttons: buttons.map((item) => item.label), defaultId: defaultId >= 0 ? defaultId : 0, ...(allowCancel && cancelId >= 0 ? { cancelId } : {}), title: translate('dirtyCloseTitle'), message: translate('dirtyCloseMessage', { name: title }), detail: translate(writeAccess.writable ? 'dirtyCloseDetail' : 'readOnlyDirtyCloseDetail'), noLink: true })).response]?.action ?? (allowCancel ? 'cancel' : defaultAction);
    if (action === 'discard' || action === 'cancel' || action === 'save') return { action };
    const targetFilePath = await (deps.requestSaveAsPath || defaultRequestSaveAsPath)({ sourceFilePath: context.filePath, title: translate('chooseSaveAsFileTitle'), dialogProvider: platform });
    if (targetFilePath) return { action: 'saveAs', targetFilePath };
    if (allowCancel) return { action: 'cancel' };
  }
}
async function requestNativeHostOriginalFileConflictDecision(context, platform, deps = {}) {
  const translate = deps.formatText || ((key, values) => formatLocalPreviewText(key, values, deps)); const title = context.title || path.basename(context.filePath);
  const buttons = platform.osPlatform === 'darwin' ? [{ action: 'cancel', label: translate('cancelButton') }, { action: 'overwrite', label: translate('overwriteButton') }, { action: 'saveAs', label: translate('saveAsButton') }] : [{ action: 'saveAs', label: translate('saveAsButton') }, { action: 'overwrite', label: translate('overwriteButton') }, { action: 'cancel', label: translate('cancelButton') }];
  const result = await platform.showMessageBox({ type: 'warning', buttons: buttons.map((item) => item.label), defaultId: buttons.findIndex((item) => item.action === 'saveAs'), cancelId: buttons.findIndex((item) => item.action === 'cancel'), title: translate('originalChangedConflictTitle'), message: translate('originalChangedConflictMessage', { name: title }), detail: translate('originalChangedConflictDetail'), noLink: true });
  const action = buttons[result.response]?.action ?? 'cancel';
  if (action !== 'saveAs') return { action };
  const targetFilePath = await (deps.requestSaveAsPath || defaultRequestSaveAsPath)({ sourceFilePath: context.filePath, title: translate('chooseSaveAsFileTitle'), dialogProvider: platform });
  return targetFilePath ? { action: 'saveAs', targetFilePath } : { action: 'cancel' };
}
async function notifyNativeHostOriginalFileChanged(notification, platform, deps = {}) {
  const translate = deps.formatText || ((key, values) => formatLocalPreviewText(key, values, deps)); const title = notification.title || path.basename(notification.filePath); const clean = notification.isDirty === false;
  try { await platform.showMessageBox({ type: 'warning', buttons: [translate('acknowledgeButton')], defaultId: 0, cancelId: 0, title: translate('originalChangedNotificationTitle'), message: translate(clean ? 'originalChangedCleanNotificationBody' : 'originalChangedNotificationBody', { name: title }), detail: translate(clean ? 'originalChangedCleanNotificationDetail' : 'originalChangedDirtyNotificationDetail'), noLink: true }); } catch (error) { deps.logger?.warn?.('[TencentDocsDocumentService] original file changed message box failed', { error: String(error) }); }
}

module.exports = Object.freeze({ createNativeHostDirtyEditorCloseDecision, createNativeHostOriginalFileChangedNotifier, createNativeHostOriginalFileConflictDecision, notifyNativeHostOriginalFileChanged, requestNativeHostDirtyEditorCloseDecision, requestNativeHostOriginalFileConflictDecision });
