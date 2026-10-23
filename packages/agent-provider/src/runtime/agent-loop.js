'use strict';

const { HookEvent } = require('./hook-registry');
const { runAgentTurn } = require('./agent-turn');

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
      const turnResult = await runAgentTurn(session, runtime);
      if (turnResult.completed) {
        session.status = turnResult.reason === 'cancelled' ? 'cancelled' : 'completed';
        return turnResult.message;
      }
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
