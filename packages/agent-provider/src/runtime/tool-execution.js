'use strict';

const { HookEvent } = require('./hook-registry');
const { getPermissionInput, normalizePermissionDecision } = require('./permission-result');

async function executeToolCall(call, context) {
  if (context.signal?.aborted) return toolResult(call, true, 'Tool use cancelled', { cancelled: true });
  const tool = context.tools.get(call.name);
  if (!tool) return toolResult(call, true, `Unknown tool: ${call.name}`);

  let parsed;
  try {
    parsed = tool.parseInput ? tool.parseInput(call.input) : call.input;
  } catch (error) {
    return toolResult(call, true, error instanceof Error ? error.message : String(error));
  }
  const preHook = await context.hooks?.run(HookEvent.PRE_TOOL_USE, { call, tool, input: parsed }, context);
  if (preHook?.stopped) return toolResult(call, true, preHook.reason, { hook: HookEvent.PRE_TOOL_USE });
  if (preHook?.payload?.input !== undefined) parsed = preHook.payload.input;

  let decision = normalizePermissionDecision(
    await context.permissions.canUse(tool, parsed, context),
    parsed,
  );
  if (preHook?.payload?.permissionDecision) {
    decision = normalizePermissionDecision({
      ...decision,
      behavior: preHook.payload.permissionDecision,
      source: 'hook',
      message: preHook.payload.additionalContext,
    }, parsed);
  }
  if (context.signal?.aborted) return toolResult(call, true, 'Tool use cancelled', { cancelled: true });
  if (decision.behavior === 'ask' && context.interruptions) {
    decision = normalizePermissionDecision(await context.interruptions.request({
      id: call.id,
      type: 'tool_permission',
      toolName: call.name,
      input: parsed,
    }), parsed);
  }
  if (decision.behavior !== 'allow') {
    return toolResult(call, true, decision.message || 'Tool use denied', { decision });
  }

  try {
    const finalInput = getPermissionInput(decision, parsed);
    if (finalInput !== parsed) parsed = tool.parseInput ? tool.parseInput(finalInput) : finalInput;
    let output = await tool.execute(parsed, context);
    const postHook = await context.hooks?.run(HookEvent.POST_TOOL_USE, { call, tool, input: parsed, output }, context);
    if (postHook?.payload?.output !== undefined) output = postHook.payload.output;
    return toolResult(call, false, output, { decision, input: parsed, stopped: postHook?.stopped || false });
  } catch (error) {
    const message = context.signal?.aborted ? 'Tool use cancelled' : error instanceof Error ? error.message : String(error);
    await context.hooks?.run(HookEvent.POST_TOOL_USE_FAILURE, { call, tool, input: parsed, error: message }, context);
    return toolResult(call, true, message);
  }
}

function toolResult(call, isError, content, metadata = {}) {
  return {
    type: 'tool_result',
    toolUseId: call.id,
    toolName: call.name,
    isError,
    content,
    metadata,
  };
}

module.exports = { executeToolCall, toolResult };
