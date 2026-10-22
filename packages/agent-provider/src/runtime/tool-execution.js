'use strict';

async function executeToolCall(call, context) {
  const tool = context.tools.get(call.name);
  if (!tool) return toolResult(call, true, `Unknown tool: ${call.name}`);

  const parsed = tool.parseInput ? tool.parseInput(call.input) : call.input;
  const decision = await context.permissions.canUse(tool, parsed, context);
  if (decision.behavior !== 'allow') {
    return toolResult(call, true, decision.message || 'Tool use denied', { decision });
  }

  try {
    const output = await tool.execute(parsed, context);
    return toolResult(call, false, output, { decision });
  } catch (error) {
    if (context.signal?.aborted) return toolResult(call, true, 'Tool use cancelled');
    return toolResult(call, true, error instanceof Error ? error.message : String(error));
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
