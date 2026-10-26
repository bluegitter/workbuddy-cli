'use strict';

const path = require('node:path');
const { formatLocalPreviewText } = require('../save/local-preview-text');

async function defaultRequestOriginalFileConflictDecision(context, options = {}) {
  const dialogProvider = options.dialogProvider;
  if (!dialogProvider) return { action: 'cancel' };
  const translate = options.formatText || ((key, values) => formatLocalPreviewText(key, values, options));
  const title = context.title || path.basename(context.filePath);
  const buttons = (options.isDarwin ?? process.platform === 'darwin') ? [{ action: 'cancel', label: translate('cancelButton') }, { action: 'overwrite', label: translate('overwriteButton') }, { action: 'saveAs', label: translate('saveAsButton') }] : [{ action: 'saveAs', label: translate('saveAsButton') }, { action: 'overwrite', label: translate('overwriteButton') }, { action: 'cancel', label: translate('cancelButton') }];
  const result = await dialogProvider.showMessageBox({ type: 'warning', buttons: buttons.map((item) => item.label), defaultId: buttons.findIndex((item) => item.action === 'saveAs'), cancelId: buttons.findIndex((item) => item.action === 'cancel'), title: translate('originalChangedConflictTitle'), message: translate('originalChangedConflictMessage', { name: title }), detail: translate('originalChangedConflictDetail'), noLink: true });
  const action = buttons[result.response]?.action ?? 'cancel';
  if (action !== 'saveAs') return { action };
  const targetFilePath = await options.requestSaveAsPath?.({ sourceFilePath: context.filePath, title: translate('chooseSaveAsFileTitle'), dialogProvider });
  return targetFilePath ? { action: 'saveAs', targetFilePath } : { action: 'cancel' };
}

module.exports = Object.freeze({ defaultRequestOriginalFileConflictDecision });
