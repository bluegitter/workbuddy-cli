'use strict';

const { buildAgentContext } = require('./context-builder');
const { normalizeModelResponse } = require('./messages');
const { runTools } = require('./tool-orchestration');

/**
 * Execute one model/tool turn. Keeping this boundary small makes the outer
 * loop responsible only for lifecycle and turn limits, while this function
 * owns the Claude-style "assistant -> tools -> tool_result" exchange.
 */
async function runAgentTurn(session, runtime) {
  if (session.abortController.signal.aborted) {
    return { completed: true, reason: 'cancelled', message: session.messages.at(-1) };
  }

  const response = normalizeModelResponse(await runtime.model.complete(
    buildAgentContext(session, runtime.context),
  ));
  session.append(response.message);

  const calls = response.toolCalls;
  if (calls.length === 0 || isTerminalStopReason(response.stopReason)) {
    return { completed: true, reason: response.stopReason || 'end_turn', response, message: response.message };
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
  return { completed: false, reason: 'tool_use', response, results, message: results.at(-1) };
}

function isTerminalStopReason(reason) {
  return reason === 'end_turn' || reason === 'stop_sequence' || reason === 'stop' || reason === 'completed';
}

module.exports = { isTerminalStopReason, runAgentTurn };
