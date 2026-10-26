'use strict';

const path = require('node:path');
const { buildLocalDocumentDirtyCloseChoices } = require('../save/local-document-save');
const { formatLocalPreviewText } = require('../save/local-preview-text');

async function defaultRequestDirtyEditorCloseDecision(context, options = {}) {
  const dialogProvider = options.dialogProvider;
  if (!dialogProvider) return context.source === 'open-eviction' ? { action: 'discard' } : { action: 'cancel' };
  const translate = options.formatText || ((key, values) => formatLocalPreviewText(key, values, options));
  const title = context.title || path.basename(context.filePath); const allowCancel = context.source !== 'open-eviction';
  const writeAccess = await (options.getLocalDocumentWriteAccess || (async () => ({ writable: true })))(context.filePath);
  while (true) {
    const buttons = buildLocalDocumentDirtyCloseChoices({ isDarwin: options.isDarwin ?? process.platform === 'darwin', canSaveOriginal: writeAccess.writable, labels: { saveButton: translate('saveButton'), saveAsButton: translate('saveAsButton'), cancelButton: translate('cancelButton'), discardButton: translate('discardButton') } }).filter((item) => allowCancel || item.action !== 'cancel');
    const defaultAction = writeAccess.writable ? 'save' : 'saveAs'; const defaultId = buttons.findIndex((item) => item.action === defaultAction); const cancelId = buttons.findIndex((item) => item.action === 'cancel');
    const action = buttons[(await dialogProvider.showMessageBox({ type: 'warning', buttons: buttons.map((item) => item.label), defaultId: defaultId >= 0 ? defaultId : 0, ...(allowCancel && cancelId >= 0 ? { cancelId } : {}), title: translate('dirtyCloseTitle'), message: translate('dirtyCloseMessage', { name: title }), detail: translate(writeAccess.writable ? 'dirtyCloseDetail' : 'readOnlyDirtyCloseDetail'), noLink: true })).response]?.action ?? (allowCancel ? 'cancel' : defaultAction);
    if (action === 'discard' || action === 'cancel' || action === 'save') return { action };
    const targetFilePath = await options.requestSaveAsPath?.({ sourceFilePath: context.filePath, title: translate('chooseSaveAsFileTitle'), dialogProvider });
    if (targetFilePath) return { action: 'saveAs', targetFilePath };
    if (allowCancel) return { action: 'cancel' };
  }
}

module.exports = Object.freeze({ defaultRequestDirtyEditorCloseDecision });
