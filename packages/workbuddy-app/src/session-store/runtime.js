'use strict';

const runtimeBySession = new Map();
function setSessionRuntimeConfig(sessionId, config = {}) {
  if (!sessionId) return;
  const current = runtimeBySession.get(sessionId) || { sessionId };
  runtimeBySession.set(sessionId, { ...current, sessionId, cwd: config.cwd, mcpServers: [...(config.mcpServers || [])], updatedAt: Date.now() });
}
function getSessionRuntimeConfig(sessionId) {
  const snapshot = runtimeBySession.get(sessionId);
  if (!snapshot?.cwd) return undefined;
  return { cwd: snapshot.cwd, mcpServers: snapshot.mcpServers ? [...snapshot.mcpServers] : [] };
}
function clearSessionRuntimeConfig(sessionId) { runtimeBySession.delete(sessionId); }

module.exports = Object.freeze({ setSessionRuntimeConfig, getSessionRuntimeConfig, clearSessionRuntimeConfig });
