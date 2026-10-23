'use strict';

/**
 * Normalize permission callbacks to the small contract consumed by the agent
 * loop. Claude Code permission results may carry a replacement input after a
 * user or hook edits the proposed tool call.
 */
function normalizePermissionDecision(decision, fallbackInput) {
  const result = decision && typeof decision === 'object' ? decision : {};
  const behavior = result.behavior || 'deny';
  const updatedInput = result.updatedInput === undefined
    ? fallbackInput
    : result.updatedInput;
  return {
    ...result,
    behavior,
    updatedInput,
  };
}

function getPermissionInput(decision, fallbackInput) {
  return decision?.updatedInput === undefined ? fallbackInput : decision.updatedInput;
}

module.exports = { getPermissionInput, normalizePermissionDecision };
