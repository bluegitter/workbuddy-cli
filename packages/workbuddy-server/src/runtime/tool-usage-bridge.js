'use strict';

const TAG = '[IdleCapabilityBridge]';

function readStringField(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  return typeof value[key] === 'string' ? value[key] : undefined;
}

function parseToolUsage(toolName, rawInput) {
  if (toolName === 'Skill') {
    const skillId = readStringField(rawInput, 'skill') || readStringField(rawInput, 'command');
    return skillId ? { observation: { type: 'skill', id: skillId.toLowerCase().trim() } } : null;
  }
  if (toolName === 'Agent') {
    const subagent = readStringField(rawInput, 'subagent_type');
    return subagent ? { observation: { type: 'subagent', id: subagent.trim() } } : null;
  }
  if (toolName === 'DeferExecuteTool') {
    const innerToolName = readStringField(rawInput, 'toolName');
    return innerToolName ? parseToolUsage(innerToolName, rawInput && typeof rawInput === 'object' ? rawInput.params : undefined) : null;
  }
  const mcpMatch = typeof toolName === 'string' ? toolName.match(/^mcp__(.+?)__(.+)$/) : null;
  return mcpMatch && mcpMatch[1] ? { observation: { type: 'mcp', id: mcpMatch[1] } } : null;
}

function createToolUsageBridge(deps = {}) {
  const recordedToolCalls = new Set();
  const observer = {
    observe(event = {}) {
      try {
        if (event.isBackgroundAutomation === true || event.sourceMode === 'background') return;
        if (event.status !== 'completed' || !event.toolName || recordedToolCalls.has(event.toolCallId)) return;
        const parsed = parseToolUsage(event.toolName, event.rawInput);
        if (!parsed) return;
        const facade = deps.getFacade?.();
        if (!facade) return;
        recordedToolCalls.add(event.toolCallId);
        Promise.resolve(facade.recordUsage?.(parsed.observation)).catch((error) => deps.logger?.warn?.(`${TAG} recordUsage failed`, { observation: parsed.observation, error: String(error) }));
        Promise.resolve(facade.recordActiveDay?.()).catch((error) => deps.logger?.warn?.(`${TAG} recordActiveDay failed`, { error: String(error) }));
      } catch (error) {
        deps.logger?.warn?.(`${TAG} observe threw`, { error: String(error) });
      }
    },
  };
  observer.__recordedToolCalls = recordedToolCalls;
  return observer;
}

module.exports = Object.freeze({ parseToolUsage, createToolUsageBridge });
