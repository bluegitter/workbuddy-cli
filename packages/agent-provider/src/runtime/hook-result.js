'use strict';

/** Normalize Claude-style hook output into the internal hook contract. */
function normalizeHookResult(result, currentPayload) {
  if (!result || typeof result !== 'object') return undefined;
  const specific = result.hookSpecificOutput || {};
  const payload = {
    ...(result.payload || currentPayload || {}),
    ...(specific.updatedInput ? { input: specific.updatedInput } : {}),
    ...(specific.additionalContext ? { additionalContext: specific.additionalContext } : {}),
    ...(specific.permissionDecision ? { permissionDecision: specific.permissionDecision } : {}),
  };
  const stop = result.block || result.stop || result.continue === false || result.decision === 'block';
  return {
    payload,
    stopped: Boolean(stop),
    reason: result.reason || result.stopReason || specific.permissionDecisionReason || 'blocked by hook',
  };
}

module.exports = { normalizeHookResult };
