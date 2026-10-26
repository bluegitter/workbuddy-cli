'use strict';

const { isClawWorkspacePath } = require('../../workspace/claw-workspace-path');
const { parseRRule } = require('../../automation/schedule-utils');

const PUBLIC_MODES = new Set(['list', 'view', 'create', 'update', 'delete']);
const MODE_ALIASES = { 'suggested create': 'create', 'suggested update': 'update' };

function errorResult(message) { return { content: [{ type: 'text', text: message }], isError: true }; }
function successResult(data) { return { content: [{ type: 'text', text: JSON.stringify(data) }] }; }
function parseToolCwds(cwds) { return String(cwds).split(',').map((cwd) => cwd.trim()).filter(Boolean); }
function toServiceMode(mode) { return mode === 'create' ? 'suggested create' : 'suggested update'; }
function toListSummary(item) { return { id: item.id, name: item.name, status: item.status, scheduleType: item.scheduleType, ...(item.scheduleType === 'once' ? { scheduledAt: item.scheduledAt } : { rrule: item.rrule }) }; }
function toViewDetail(item) { return { id: item.id, name: item.name, prompt: item.prompt, status: item.status, scheduleType: item.scheduleType, rrule: item.rrule, scheduledAt: item.scheduledAt ?? null, validFrom: item.validFrom ?? null, validUntil: item.validUntil ?? null, cwds: item.cwds }; }
function toAutomationSummary(item) { if (!item) return undefined; return { id: item.id, name: item.name, prompt: item.prompt, status: item.status, scheduleType: item.scheduleType, rrule: item.rrule, scheduledAt: item.scheduledAt, validFrom: item.validFrom, validUntil: item.validUntil, nextRunAt: item.nextRunAt, cwds: item.cwds }; }
function clawWorkspaceRejection(cwd) { return errorResult(`Error: The Claw workspace "${cwd}" cannot host automations.`); }

function createAutomationUpdateTool(automationService, eventService = { report() {} }, resolveCurrentSessionModelId, resolveExpertId) {
  return {
    name: 'automation_update',
    description: 'List, view, create, update, or delete scheduled automations.',
    inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: [...PUBLIC_MODES] }, id: { type: 'string' }, name: { type: 'string' }, prompt: { type: 'string' }, scheduleType: { type: 'string' }, rrule: { type: 'string' }, scheduledAt: { type: 'string' }, cwds: { type: 'string' }, status: { type: 'string' }, validFrom: { type: 'string' }, validUntil: { type: 'string' }, modelId: { type: 'string' }, modelIsThinking: { type: 'boolean' }, expertId: { type: 'string' }, expertMarketplace: { type: 'string' }, connectorIds: { type: 'array', items: { type: 'string' } } }, required: ['mode'] },
    handler: async (args = {}, context) => {
      const mode = MODE_ALIASES[args.mode] || args.mode;
      if (!PUBLIC_MODES.has(mode)) return errorResult(`Error: unsupported automation mode: ${args.mode || ''}`);
      const service = automationService?.service;
      if (!service) return errorResult('Error: Automation service not initialized');
      if (mode === 'list') return successResult({ type: 'automation_update_tool_result', mode, success: true, message: 'Automations listed', automations: (await service.getSnapshot()).automations.map(toListSummary) });
      if ((mode === 'view' || mode === 'delete' || mode === 'update') && !args.id) return errorResult(`Error: id is required for ${mode} mode`);
      if (mode === 'view') { const result = await service.updateFromTool({ mode: 'view', id: args.id }); return successResult({ type: 'automation_update_tool_result', mode, success: Boolean(result.success), message: result.message, automation: result.automation ? toViewDetail(result.automation) : undefined }); }
      if (mode === 'delete') { const result = await service.deleteAutomation(args.id); return successResult({ type: 'automation_update_tool_result', mode, success: result.success !== false, deletedAutomationId: args.id, message: result.message || 'Automation deleted', automation: { id: args.id } }); }
      if (args.scheduleType && !['once', 'recurring'].includes(args.scheduleType)) return errorResult(`Error: invalid scheduleType: "${args.scheduleType}"`);
      if (args.status && !['ACTIVE', 'PAUSED'].includes(args.status)) return errorResult(`Error: invalid status: "${args.status}"`);
      if (args.scheduledAt && Number.isNaN(Date.parse(args.scheduledAt))) return errorResult(`Error: invalid scheduledAt format: "${args.scheduledAt}"`);
      if (args.rrule && args.scheduleType !== 'once') try { parseRRule(args.rrule); } catch (error) { return errorResult(`Error: invalid recurring rrule: ${error.message}`); }
      const explicitCwd = args.cwds === undefined ? undefined : parseToolCwds(args.cwds).find(isClawWorkspacePath);
      if (explicitCwd) return clawWorkspaceRejection(explicitCwd);
      const defaultCwd = args.cwds === undefined ? await automationService.resolveDefaultCwdForToolCall().catch(() => undefined) : undefined;
      if (defaultCwd && isClawWorkspacePath(defaultCwd)) return clawWorkspaceRejection(defaultCwd);
      const expertId = args.expertId && resolveExpertId ? await resolveExpertId(args.expertId).catch(() => args.expertId) : args.expertId;
      const modelId = args.modelId || (mode === 'create' ? resolveCurrentSessionModelId?.(context?.workbuddySessionId) : undefined);
      const result = await service.updateFromTool({ ...args, mode: toServiceMode(mode), modelId, expertId, defaultCwd });
      if (!result.success) return errorResult(`Error: ${result.message || 'Automation update failed'}`);
      return successResult({ type: 'automation_update_tool_result', mode, success: true, message: result.message, automation: toAutomationSummary(result.automation) });
    },
  };
}

module.exports = { PUBLIC_MODES, MODE_ALIASES, parseToolCwds, normalizePublicMode: (mode) => { const value = MODE_ALIASES[mode] || mode; return PUBLIC_MODES.has(value) ? value : undefined; }, toServiceMode, toListSummary, toViewDetail, toAutomationSummary, createAutomationUpdateTool };
