'use strict';

function createAgentIdentity(options = {}) {
  const sessionId = options.sessionId;
  const parentSessionId = options.parentSessionId;
  const agentId = options.agentId || sessionId;
  return {
    ...(agentId ? { agentId } : {}),
    ...(parentSessionId ? { parentSessionId } : {}),
    agentType: options.agentType || (parentSessionId ? 'subagent' : 'standalone'),
  };
}

function isSubagent(session) { return Boolean(session?.parentSessionId || session?.agentId && session.agentId !== session.id); }

function buildSessionLineage(session, sessions) {
  const result = [];
  const byId = sessions instanceof Map ? sessions : new Map(Object.entries(sessions || {}));
  let current = session;
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current);
    current = current.parentSessionId ? byId.get(current.parentSessionId) : undefined;
  }
  return result;
}

module.exports = { createAgentIdentity, isSubagent, buildSessionLineage };
