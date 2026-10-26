'use strict';
class AutomationSqliteStorageAdapter {
  constructor(database, logger = console) { this.database = database; this.logger = logger; }
  async initialize() { return this.database?.initialize?.(); }
  dispose() { this.database?.close?.(); }
  listAutomations() { return this.database?.listAutomations?.() || Promise.resolve([]); }
  readAutomation(id) { return this.database?.getAutomation?.(id) || Promise.resolve(undefined); }
  writeAutomation(item) { return this.database?.upsertAutomation?.(item) || Promise.resolve(item); }
  updateAutomationModelId(id, modelId) { return this.database?.updateAutomationModelId?.(id, modelId); }
  deleteAutomation(id) { return this.database?.deleteAutomation?.(id); }
  readRuntimeState() { return this.database?.getAutomationRuntimeState?.() || Promise.resolve({}); }
  persistRuntimeState(state, automations) { return this.database?.saveAutomationRuntimeState?.(state, automations); }
  updateAutomationNextRunAt(id, nextRunAt) { return this.database?.updateAutomationNextRunAt?.(id, nextRunAt); }
  readInbox() { return this.database?.getAutomationInbox?.() || Promise.resolve([]); }
  persistInbox(inbox) { return this.database?.saveAutomationInbox?.(inbox); }
  archiveInboxItem(inbox, itemId) { return this.database?.archiveAutomationInboxItem?.(inbox, itemId); }
  readInProgressRuns() { return this.database?.getAutomationInProgressRuns?.() || Promise.resolve([]); }
  persistInProgressRun(run) { return this.database?.saveAutomationInProgressRun?.(run); }
  removeInProgressRun(threadId) { return this.database?.deleteAutomationInProgressRun?.(threadId); }
}
module.exports = Object.freeze({ AutomationSqliteStorageAdapter });
