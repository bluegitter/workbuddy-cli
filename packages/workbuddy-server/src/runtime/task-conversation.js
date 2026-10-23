'use strict';

/**
 * Convert a local SessionRecord to the project task shape consumed by the UI.
 * Local records are intentionally marked as non-collaborative so callers can
 * merge them with cloud task results without treating them as shared tasks.
 */
function sessionRecordToTaskConversation(record = {}) {
  const createdAt = typeof record.createdAt === 'number'
    ? new Date(record.createdAt).toISOString()
    : new Date(0).toISOString();
  const lastActivityAt = typeof record.lastActivityAt === 'number'
    ? new Date(record.lastActivityAt).toISOString()
    : typeof record.updatedAt === 'number'
      ? new Date(record.updatedAt).toISOString()
      : createdAt;

  return {
    conversationId: record.id,
    title: record.name ?? '',
    status: record.status ?? 'pending',
    createdBy: '',
    createdAt,
    lastActivityAt,
    role: 'creator',
    conversationOrigin: 'local',
    isCollaborative: false,
  };
}

module.exports = Object.freeze({ sessionRecordToTaskConversation });
