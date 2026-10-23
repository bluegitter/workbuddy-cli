'use strict';

/**
 * Mutable state for one agent query. Keeping this separate from the loop
 * makes the transition points explicit and mirrors Claude Code's query state
 * object, while leaving session history as the source of truth.
 */
function createAgentLoopState(session, runtime = {}) {
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

function normalizeMaxTurns(value) {
  if (value === undefined || value === null) return 100;
  const maxTurns = Number(value);
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new RangeError('maxTurns must be a positive integer');
  }
  return maxTurns;
}

function beginAgentTurn(state) {
  if (state.session.abortController.signal.aborted) return false;
  if (state.turnCount >= state.maxTurns) return false;
  state.turnCount += 1;
  state.session.turn = state.turnCount;
  state.status = 'running';
  return true;
}

function recordAgentTurn(state, result) {
  state.lastResult = result;
  if (result?.completed) {
    state.terminal = result;
    state.status = result.reason === 'cancelled' ? 'cancelled' : 'completed';
    state.session.status = state.status;
  }
}

function finishAgentLoop(state) {
  if (state.status === 'running' || state.status === 'idle') {
    state.status = 'max_turns';
    state.session.status = 'max_turns';
  }
  return state.lastResult?.message || state.session.messages.at(-1);
}

function failAgentLoop(state, error) {
  state.status = 'failed';
  state.session.error = error;
}

module.exports = {
  beginAgentTurn,
  createAgentLoopState,
  failAgentLoop,
  finishAgentLoop,
  normalizeMaxTurns,
  recordAgentTurn,
};
