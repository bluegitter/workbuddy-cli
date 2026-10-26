declare const require: (moduleName: string) => any;

import type { AgentLoopRuntime, AgentSessionState, AgentTurnResult } from './agentLoopState';

interface HookRunner {
  run(event: unknown, context: Record<string, unknown>): Promise<unknown>;
}

interface LoopRuntime extends AgentLoopRuntime {
  hooks?: HookRunner;
  compactContext?: (session: AgentSessionState, runtime: LoopRuntime) => Promise<{ boundary?: unknown } | undefined>;
}

const { HookEvent } = require('../runtime/hook-registry');
const { runAgentTurn } = require('../runtime/agent-turn');
const { compactAgentContext } = require('../runtime/agent-compaction');
const {
  beginAgentTurn,
  createAgentLoopState,
  failAgentLoop,
  finishAgentLoop,
  recordAgentTurn,
} = require('./agentLoopState');

export async function runAgentLoop(
  session: AgentSessionState,
  runtime: LoopRuntime,
): Promise<unknown> {
  const state = createAgentLoopState(session, runtime);
  await runtime.hooks?.run(HookEvent.SESSION_START, { session });
  try {
    while (beginAgentTurn(state)) {
      const compact = typeof runtime.compactContext === 'function'
        ? await runtime.compactContext(session, runtime)
        : await compactAgentContext(session, runtime);
      if (compact?.boundary) {
        const metadata = (session as AgentSessionState & { metadata?: Record<string, unknown> }).metadata;
        if (metadata) metadata.lastCompaction = compact.boundary;
      }
      const turnResult = await runAgentTurn(session, runtime) as AgentTurnResult;
      recordAgentTurn(state, turnResult);
      if (turnResult.completed) return turnResult.message;
    }
    return finishAgentLoop(state);
  } catch (error) {
    failAgentLoop(state, error);
    throw error;
  } finally {
    await runtime.hooks?.run(HookEvent.SESSION_END, { session });
  }
}
