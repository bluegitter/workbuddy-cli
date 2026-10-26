'use strict';

function buildLocalDocumentSaveChoices({ labels, canSaveOriginal, isDarwin }) {
  const cancel = { action: 'cancel', label: labels.cancelButton }; const save = { action: 'save', label: labels.saveButton }; const saveAs = { action: 'saveAs', label: labels.saveAsButton };
  if (!canSaveOriginal) return isDarwin ? [cancel, saveAs] : [saveAs, cancel];
  return isDarwin ? [cancel, save, saveAs] : [save, saveAs, cancel];
}
function buildLocalDocumentDirtyCloseChoices({ labels, canSaveOriginal, isDarwin }) {
  const cancel = { action: 'cancel', label: labels.cancelButton }; const save = { action: 'save', label: labels.saveButton }; const saveAs = { action: 'saveAs', label: labels.saveAsButton }; const discard = { action: 'discard', label: labels.discardButton };
  if (!canSaveOriginal) return isDarwin ? [cancel, saveAs, discard] : [saveAs, discard, cancel];
  return isDarwin ? [cancel, save, saveAs, discard] : [save, saveAs, discard, cancel];
}
function getLocalDocumentDialogButtonIds({ choices, defaultAction, cancelAction }) { const defaultId = choices.findIndex((choice) => choice.action === defaultAction); const cancelId = choices.findIndex((choice) => choice.action === cancelAction); return { defaultId: defaultId >= 0 ? defaultId : 0, cancelId: cancelId >= 0 ? cancelId : 0 }; }
function buildLocalDocumentSaveAsFilters(sourceFilePath) { const extension = String(sourceFilePath || '').split('.').pop()?.trim(); return extension && extension !== sourceFilePath ? [{ name: extension.toUpperCase(), extensions: [extension] }] : undefined; }
module.exports = Object.freeze({ buildLocalDocumentDirtyCloseChoices, buildLocalDocumentSaveAsFilters, buildLocalDocumentSaveChoices, getLocalDocumentDialogButtonIds });
