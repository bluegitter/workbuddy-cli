'use strict';

const { buildAgentContext } = require('./context-builder');
const { runTools } = require('./tool-orchestration');

async function runAgentLoop(session, runtime) {
  session.status = 'running';
  for (let turn = 0; turn < (runtime.maxTurns || 100); turn += 1) {
    if (session.abortController.signal.aborted) break;
    const response = await runtime.model.complete(buildAgentContext(session, runtime.context));
    session.append(response.message);
    const calls = response.toolCalls || [];
    if (calls.length === 0) {
      session.status = 'completed';
      return response.message;
    }
    const results = await runTools(calls, {
      session,
      tools: runtime.tools,
      permissions: runtime.permissions,
      signal: session.abortController.signal,
    });
    for (const result of results) session.append(result);
  }
  if (session.status === 'running') session.status = 'max_turns';
  return session.messages.at(-1);
}

module.exports = { runAgentLoop };
