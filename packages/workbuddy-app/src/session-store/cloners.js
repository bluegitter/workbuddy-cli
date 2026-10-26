'use strict';

function cloneStructured(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cloneConversationSummary(conversation) {
  const {
    pendingInputKind: _pendingInputKind,
    teamRuntime: _teamRuntime,
    messageQueueRuntime: _messageQueueRuntime,
    ...summary
  } = conversation;
  return {
    ...summary,
    timestamp: conversation.timestamp instanceof Date
      ? new Date(conversation.timestamp)
      : conversation.timestamp,
  };
}

function cloneConversationGroup(group) {
  return {
    ...group,
    conversations: group.conversations.map(cloneConversationSummary),
  };
}

function cloneTaskData(task) {
  return {
    ...task,
    dependencies: task.dependencies ? [...task.dependencies] : undefined,
  };
}

function cloneTeamRuntimeSnapshot(snapshot) {
  return {
    ...snapshot,
    members: snapshot.members.map((member) => ({
      ...member,
      ...(member.tokenUsage ? { tokenUsage: { ...member.tokenUsage } } : {}),
      pendingPermissions: member.pendingPermissions
        ? member.pendingPermissions.map((permission) => ({ ...permission }))
        : undefined,
    })),
    memberHistories: Object.fromEntries(
      Object.entries(snapshot.memberHistories).map(([name, history]) => [
        name,
        history.map((item) => ({ ...item })),
      ]),
    ),
  };
}

function cloneFloatingPermissionRequest(request) {
  return {
    ...request,
    options: [...request.options],
    toolInput: request.toolInput && typeof request.toolInput === 'object'
      ? cloneStructured(request.toolInput)
      : request.toolInput,
  };
}

function cloneSessionTranscriptMessage(message) {
  return cloneStructured(message);
}

module.exports = Object.freeze({
  cloneStructured,
  cloneConversationSummary,
  cloneConversationGroup,
  cloneTaskData,
  cloneTeamRuntimeSnapshot,
  cloneFloatingPermissionRequest,
  cloneSessionTranscriptMessage,
});
