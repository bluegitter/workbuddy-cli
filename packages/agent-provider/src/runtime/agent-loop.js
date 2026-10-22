'use strict';

const { buildAgentContext } = require('./context-builder');
const { HookEvent } = require('./hook-registry');
const { normalizeModelResponse } = require('./messages');
const { runTools } = require('./tool-orchestration');

async function runAgentLoop(session, runtime) {
  session.status = 'running';
  await runtime.hooks?.run(HookEvent.SESSION_START, { session });
  try {
    for (let turn = 0; turn < (runtime.maxTurns || 100); turn += 1) {
      if (session.abortController.signal.aborted) break;
      session.turn = turn + 1;
      if (typeof runtime.compactContext === 'function') {
        await runtime.compactContext(session, runtime);
      }
      const response = normalizeModelResponse(await runtime.model.complete(buildAgentContext(session, runtime.context)));
      session.append(response.message);
      const calls = response.toolCalls;
      if (calls.length === 0) {
        session.status = 'completed';
        return response.message;
      }
      const results = await runTools(calls, {
        session,
        tools: runtime.tools,
        permissions: runtime.permissions,
        interruptions: runtime.interruptions,
        hooks: runtime.hooks,
        maxToolConcurrency: runtime.maxToolConcurrency,
        signal: session.abortController.signal,
      });
      for (const result of results) session.append(result);
    }
    if (session.status === 'running') session.status = 'max_turns';
    return session.messages.at(-1);
  } catch (error) {
    session.status = 'failed';
    session.error = error;
    throw error;
  } finally {
    await runtime.hooks?.run(HookEvent.SESSION_END, { session });
  }
}

module.exports = { runAgentLoop };
