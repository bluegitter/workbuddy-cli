'use strict';
const AUTOMATION_RPC_CHANNELS = Object.freeze({ GET_SNAPSHOT: 'automation:getSnapshot', UPDATE: 'automation:update', DELETE: 'automation:delete', TEST: 'automation:test', ARCHIVE_INBOX_ITEM: 'automation:archiveInboxItem', DELETE_INBOX_ITEM: 'automation:deleteInboxItem', SNAPSHOT_UPDATE: 'automation:snapshotUpdate' });
function createEmptyAutomationSnapshot() { return { automations: [], inbox: [], runtimeState: {}, updatedAt: Date.now() }; }
function createAutomationUnavailableResult(message = 'Automation service not initialized') { return { success: false, message }; }
module.exports = Object.freeze({ AUTOMATION_RPC_CHANNELS, createEmptyAutomationSnapshot, createAutomationUnavailableResult });
