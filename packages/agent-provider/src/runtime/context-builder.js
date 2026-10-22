'use strict';

function buildAgentContext(session, sources = {}) {
  return {
    system: sources.systemPrompt || '',
    project: session.project || sources.project,
    memory: sources.memory || [],
    skills: sources.skills || [],
    connectors: sources.connectors || [],
    messages: session.messages,
  };
}

module.exports = { buildAgentContext };
