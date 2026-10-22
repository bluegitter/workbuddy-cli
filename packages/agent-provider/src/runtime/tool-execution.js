'use strict';

const { HookEvent } = require('./hook-registry');

async function executeToolCall(call, context) {
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

  let decision = await context.permissions.canUse(tool, parsed, context);
  if (decision.behavior === 'ask' && context.interruptions) {
    decision = await context.interruptions.request({
      id: call.id,
      type: 'tool_permission',
      toolName: call.name,
      input: parsed,
    });
  }
  if (decision.behavior !== 'allow') {
    return toolResult(call, true, decision.message || 'Tool use denied', { decision });
  }

  try {
    let output = await tool.execute(parsed, context);
    const postHook = await context.hooks?.run(HookEvent.POST_TOOL_USE, { call, tool, input: parsed, output }, context);
    if (postHook?.payload?.output !== undefined) output = postHook.payload.output;
    return toolResult(call, false, output, { decision, stopped: postHook?.stopped || false });
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
