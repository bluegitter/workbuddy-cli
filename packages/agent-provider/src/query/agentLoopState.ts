export type AgentLoopStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'max_turns' | 'failed';

export interface AgentSessionState {
  abortController: AbortController;
  status: string;
  turn?: number;
  messages: readonly unknown[];
  error?: unknown;
}

export interface AgentTurnResult {
  completed?: boolean;
  reason?: string;
  message?: unknown;
  [key: string]: unknown;
}

export interface AgentLoopRuntime {
  maxTurns?: number | string;
  [key: string]: unknown;
}

export interface AgentLoopState {
  session: AgentSessionState;
  runtime: AgentLoopRuntime;
  maxTurns: number;
  turnCount: number;
  status: AgentLoopStatus;
  lastResult?: AgentTurnResult;
  terminal?: AgentTurnResult;
}

export function createAgentLoopState(
  session: AgentSessionState,
  runtime: AgentLoopRuntime = {},
): AgentLoopState {
  const maxTurns = normalizeMaxTurns(runtime.maxTurns);
  session.status = 'running';
  return {
    session,
    runtime,
    maxTurns,
    turnCount: 0,
    status: 'idle',
    lastResult: undefined,
    terminal: undefined,
  };
}

export function normalizeMaxTurns(value: number | string | null | undefined): number {
  if (value === undefined || value === null) return 100;
  const maxTurns = Number(value);
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new RangeError('maxTurns must be a positive integer');
  }
  return maxTurns;
}

export function beginAgentTurn(state: AgentLoopState): boolean {
  if (state.session.abortController.signal.aborted) return false;
  if (state.turnCount >= state.maxTurns) return false;
  state.turnCount += 1;
  state.session.turn = state.turnCount;
  state.status = 'running';
  return true;
}

export function recordAgentTurn(state: AgentLoopState, result: AgentTurnResult): void {
  state.lastResult = result;
  if (result?.completed) {
    state.terminal = result;
    state.status = result.reason === 'cancelled' ? 'cancelled' : 'completed';
    state.session.status = state.status;
  }
}

export function finishAgentLoop(state: AgentLoopState): unknown {
  if (state.status === 'running' || state.status === 'idle') {
    state.status = 'max_turns';
    state.session.status = 'max_turns';
  }
  return state.lastResult?.message || state.session.messages.at(-1);
}

export function failAgentLoop(state: AgentLoopState, error: unknown): void {
  state.status = 'failed';
  state.session.error = error;
}
