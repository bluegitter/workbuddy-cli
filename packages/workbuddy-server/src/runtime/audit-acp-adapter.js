'use strict';

const crypto = require('crypto');

const MAX_CACHE_SIZE = 1000;
const MAX_PARAM_LEN = 200;
const TOOL_BASH = 'Bash';
const TOOL_WEB_FETCH = 'WebFetch';
const MCP_TOOL_PREFIX = 'mcp__';
const META_TOOL_NAME = 'codebuddy.ai/toolName';
const META_PERMISSION_RESOLVED = 'codebuddy.ai/permissionResolved';
const META_TOOL_CALL_ID = 'codebuddy.ai/toolCallId';
const META_DECISION = 'codebuddy.ai/decision';

const TOOL_AUDIT_RULES = Object.freeze({
  [TOOL_BASH]: {
    extractParams: (input) => ({ command: truncateUtf16(String(input.command ?? ''), MAX_PARAM_LEN) }),
    keys: { approved: { category: 'approval', key: 'securityCenter.audit.approval.commandApproved' }, rejected: { category: 'rejection', key: 'securityCenter.audit.rejection.commandRejected' } },
  },
  [TOOL_WEB_FETCH]: {
    extractParams: (input, errorMessage) => ({ target: String(input.url ?? ''), ...(errorMessage ? { reason: truncateUtf16(errorMessage, MAX_PARAM_LEN) } : {}) }),
    keys: { allowed: { category: 'network', key: 'securityCenter.audit.network.success' }, failed: { category: 'network', key: 'securityCenter.audit.network.failed' } },
  },
});

const MCP_AUDIT_KEYS = Object.freeze({
  allowed: { category: 'mcp', key: 'securityCenter.audit.mcp.executed' },
  failed: { category: 'mcp', key: 'securityCenter.audit.mcp.failed' },
});

function createAuditAcpAdapter(deps = {}) {
  const cache = new Map();
  const store = deps.store;
  const now = deps.now || (() => Date.now());
  const rememberInput = (toolCallId, info) => {
    if (cache.size >= MAX_CACHE_SIZE && !cache.has(toolCallId)) cache.delete(cache.keys().next().value);
    cache.delete(toolCallId);
    cache.set(toolCallId, info);
  };
  return {
    async consume(notification) {
      try {
        const root = notification || {};
        const update = root.update || {};
        const kind = update.sessionUpdate;
        if (!['tool_call', 'tool_call_update', 'session_info_update'].includes(kind)) return;
        const meta = readCodeBuddyMeta(root._meta, update._meta);
        if (kind === 'session_info_update') {
          if (meta?.[META_PERMISSION_RESOLVED] !== true) return;
          const toolCallId = readString(meta[META_TOOL_CALL_ID]);
          const toolName = readString(meta[META_TOOL_NAME]);
          const decision = mapPermissionDecision(readString(meta[META_DECISION]));
          const rule = TOOL_AUDIT_RULES[toolName];
          if (!toolCallId || !toolName || !rule || !decision || !rule.keys[decision]) return;
          const cached = cache.get(toolCallId);
          const rawInput = cached?.rawInput || {};
          if (toolName === TOOL_BASH && !hasNonEmptyString(rawInput.command)) { cache.delete(toolCallId); return; }
          await store?.append?.(buildNamedToolEntry(toolCallId, cached || { toolName, rawInput }, decision, undefined, root.sessionId, now()));
          cache.delete(toolCallId);
          return;
        }
        const toolCallId = update.toolCallId;
        if (!toolCallId) return;
        const toolName = meta ? readString(meta[META_TOOL_NAME]) : undefined;
        if (kind === 'tool_call') {
          if (!toolName || !isAuditedToolName(toolName)) return;
          rememberInput(toolCallId, { toolName, rawInput: update.rawInput || {}, sessionId: root.sessionId });
          return;
        }
        const cached = cache.get(toolCallId);
        if (!cached || cached.toolName === TOOL_BASH) return;
        const decision = mapToolUpdateStatus(update.status);
        if (!decision) return;
        const errorMessage = decision === 'failed' ? extractErrorMessage(update.rawOutput) : undefined;
        const entry = cached.toolName.startsWith(MCP_TOOL_PREFIX)
          ? buildMcpEntry(toolCallId, cached, decision, errorMessage, root.sessionId, now())
          : buildNamedToolEntry(toolCallId, cached, decision, errorMessage, root.sessionId, now());
        if (entry) await store?.append?.(entry);
        cache.delete(toolCallId);
      } catch (error) {
        deps.logger?.warn?.(`[audit-acp-adapter] consume failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    get cacheSize() { return cache.size; },
  };
}

function isAuditedToolName(name) { return name === TOOL_BASH || name === TOOL_WEB_FETCH || (typeof name === 'string' && name.startsWith(MCP_TOOL_PREFIX)); }
function buildNamedToolEntry(toolCallId, cached, decision, errorMessage, rootSessionId, timestamp) {
  const rule = TOOL_AUDIT_RULES[cached.toolName];
  if (!rule) return undefined;
  const keyEntry = cached.toolName === TOOL_WEB_FETCH && decision === 'failed' && errorMessage ? { category: 'network', key: 'securityCenter.audit.network.failedWithReason' } : rule.keys[decision];
  if (!keyEntry) return undefined;
  return { source: 'desktop-main', category: keyEntry.category, eventType: cached.toolName, messageKey: keyEntry.key, messageParams: rule.extractParams(cached.rawInput || {}, errorMessage), decision: toAuditDecision(decision), timestamp, sessionId: cached.sessionId ?? rootSessionId, toolCallId, commandHash: computeForensicHash(cached.toolName, cached.rawInput || {}) };
}
function buildMcpEntry(toolCallId, cached, decision, errorMessage, rootSessionId, timestamp) {
  const keyEntry = MCP_AUDIT_KEYS[decision];
  if (!keyEntry) return undefined;
  const rest = cached.toolName.slice(MCP_TOOL_PREFIX.length);
  const separator = rest.indexOf('__');
  return { source: 'desktop-main', category: keyEntry.category, eventType: cached.toolName, messageKey: keyEntry.key, messageParams: { serverName: separator > 0 ? rest.slice(0, separator) : rest, toolName: separator > 0 ? rest.slice(separator + 2) : '', ...(errorMessage ? { reason: truncateUtf16(errorMessage, MAX_PARAM_LEN) } : {}) }, decision: toAuditDecision(decision), timestamp, sessionId: cached.sessionId ?? rootSessionId, toolCallId, commandHash: computeForensicHash(cached.toolName, cached.rawInput || {}) };
}
function computeForensicHash(toolName, rawInput) { return sha256Hex(toolName === TOOL_BASH ? String(rawInput.command ?? '') : `${toolName}\n${stableStringify(rawInput)}`); }
function readCodeBuddyMeta(...values) {
  const merged = {};
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const nested = value['codebuddy.ai'];
    if (nested && typeof nested === 'object') for (const [key, item] of Object.entries(nested)) merged[`codebuddy.ai/${key}`] = item;
    for (const [key, item] of Object.entries(value)) if (key !== 'codebuddy.ai') merged[key] = item;
  }
  return Object.keys(merged).length ? merged : undefined;
}
function mapToolUpdateStatus(status) { return status === 'completed' ? 'allowed' : status === 'failed' ? 'failed' : undefined; }
function mapPermissionDecision(decision) { return decision === 'allow' || decision === 'allowAll' ? 'approved' : decision === 'deny' || decision === 'rejectAndExitPlan' ? 'rejected' : undefined; }
function toAuditDecision(decision) { return decision === 'allowed' || decision === 'failed' ? decision : decision === 'approved' ? 'approved' : 'rejected'; }
function extractErrorMessage(rawOutput) { const value = rawOutput?.errorMessage ?? rawOutput?.message ?? rawOutput?.error; return typeof value === 'string' && value ? value : undefined; }
function isTransientDisconnectMessage(message) { return message === 'disconnected' || message === 'WorkBuddy daemon client disconnected' || /: not connected \(state=(?:connecting|reconnecting|disconnected)\)$/i.test(message) || /: connection lost \(/i.test(message) || /^ACP transport is not connected$/i.test(message); }
function readString(value) { return typeof value === 'string' ? value : undefined; }
function hasNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function truncateUtf16(value, max) { return value.length > max ? value.slice(0, max) : value; }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function sha256Hex(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

module.exports = Object.freeze({ createAuditAcpAdapter, buildNamedToolEntry, buildMcpEntry, isAuditedToolName, isTransientDisconnectMessage, stableStringify, sha256Hex });
