'use strict';

const { HookEvent } = require('./hook-registry');
const { runAgentTurn } = require('./agent-turn');
const { compactAgentContext } = require('./agent-compaction');
const {
  beginAgentTurn,
  createAgentLoopState,
  failAgentLoop,
  finishAgentLoop,
  recordAgentTurn,
} = require('./agent-loop-state');

async function runAgentLoop(session, runtime) {
  const state = createAgentLoopState(session, runtime);
  await runtime.hooks?.run(HookEvent.SESSION_START, { session });
  try {
    while (beginAgentTurn(state)) {
      const compact = typeof runtime.compactContext === 'function'
        ? await runtime.compactContext(session, runtime)
        : await compactAgentContext(session, runtime);
      if (compact?.boundary) session.metadata.lastCompaction = compact.boundary;
      const turnResult = await runAgentTurn(session, runtime);
      recordAgentTurn(state, turnResult);
      if (turnResult.completed) {
        return turnResult.message;
      }
    }
    return finishAgentLoop(state);
  } catch (error) {
    failAgentLoop(state, error);
    throw error;
  } finally {
    await runtime.hooks?.run(HookEvent.SESSION_END, { session });
  }
}

module.exports = { runAgentLoop };
