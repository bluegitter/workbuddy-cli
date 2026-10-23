'use strict';

const { getPermissionInput, normalizePermissionDecision } = require('./permission-result');

/**
 * Combine a tool's content-specific permission check with the agent-wide
 * permission controller. Tool denials and prompts are authoritative; an
 * allow/passthrough result still flows through global modes and rules.
 */
async function resolveToolPermission(tool, input, context) {
  let toolDecision;
  if (typeof tool.checkPermissions === 'function') {
    try {
      toolDecision = normalizePermissionDecision(
        await tool.checkPermissions(input, context),
        input,
      );
    } catch (error) {
      context.logger?.warn?.(`Tool permission check failed for ${tool.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (toolDecision?.behavior === 'deny' || toolDecision?.behavior === 'ask') {
    return toolDecision;
  }

  const permissionInput = getPermissionInput(toolDecision, input);
  const globalDecision = context.permissions?.canUse
    ? await context.permissions.canUse(tool, permissionInput, context)
    : { behavior: 'allow', source: 'default' };
  const normalizedGlobal = normalizePermissionDecision(globalDecision, permissionInput);
  return {
    ...toolDecision,
    ...normalizedGlobal,
    updatedInput: getPermissionInput(normalizedGlobal, permissionInput),
  };
}

module.exports = Object.freeze({ resolveToolPermission });
