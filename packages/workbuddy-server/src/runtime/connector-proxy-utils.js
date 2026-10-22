'use strict';

const ALLOWED_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0:0:0:0:0:0:0:1']);

function matchesUriTemplate(uri, uriTemplate) {
  let working = uriTemplate;
  const queryMatch = working.match(/\{\?[^}]+\}/);
  if (queryMatch) working = working.replace(queryMatch[0], '');
  let pattern = working.replace(/[.+^$|()\\[\]]/g, '\\$&').replace(/\{[^}?]+\}/g, '[^/?#]+');
  if (queryMatch) pattern += '(?:\\?.*)?';
  return new RegExp(`^${pattern}$`).test(uri);
}

function formatProxyServerLog(message, meta) { return meta ? `${message} ${JSON.stringify(meta)}` : message; }
function readHeader(req, name) { const value = req.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }

function sanitizeProxyServerLogValue(value, depth = 0) {
  if (depth >= 3) return '[truncated]';
  if (value == null || ['number', 'boolean', 'string'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeProxyServerLogValue(item, depth + 1));
  if (value instanceof Error) return serializeProxyServerErrorForLog(value);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, nested]) => [key, sanitizeProxyServerLogValue(nested, depth + 1)]));
  return String(value);
}

function serializeProxyServerErrorForLog(error) {
  if (!(error instanceof Error)) return { message: String(error) };
  return { name: error.name, message: error.message, stack: error.stack, code: error.code, data: sanitizeProxyServerLogValue(error.data), cause: error.cause ? serializeProxyServerErrorCauseForLog(error.cause) : undefined };
}
function serializeProxyServerErrorCauseForLog(error) { return error instanceof Error ? serializeProxyServerErrorForLog(error) : String(error); }
function summarizeProxyCallArgsForLog(args) { return Object.fromEntries(Object.entries(args).slice(0, 10).map(([key, value]) => [key, sanitizeProxyServerLogValue(value)])); }

function buildConnectorMcpCallContext(getContext, meta) {
  const base = getContext(); const m = meta || {};
  const pick = (key) => typeof m[`workbuddy.ai/${key}`] === 'string' && m[`workbuddy.ai/${key}`].length ? m[`workbuddy.ai/${key}`] : undefined;
  const rawTrigger = pick('triggerSource');
  return {
    workbuddySessionId: base.workbuddySessionId,
    projectId: base.projectId,
    conversationId: pick('conversationId'), requestId: pick('requestId'), messageId: pick('messageId'), toolCallId: pick('toolCallId'),
    agentMode: pick('mode'), expertId: pick('expertId'),
    triggerSource: ['auto', 'skill', 'user_mention'].includes(rawTrigger) ? rawTrigger : undefined,
    modelId: typeof m.modelId === 'string' && m.modelId.length ? m.modelId : undefined,
  };
}

function classifyToolStatus(error) { const message = error instanceof Error ? error.message : String(error); return error instanceof DOMException && error.name === 'AbortError' || /aborted|cancell?ed/i.test(message) ? 'cancelled' : 'failed'; }
function extractErrorCode(error) { const message = error instanceof Error ? error.message : String(error); const head = message.split(':')[0]?.trim().slice(0, 64); return head || undefined; }
function inferConnectorKind(config) { if (!config) return 'oauthMCP'; if (config.type === 'cli') return 'oauthCli'; if (config.authMode === 'token') return 'tokenMCP'; return 'oauthMCP'; }

module.exports = { ALLOWED_LOOPBACK_HOSTS, matchesUriTemplate, formatProxyServerLog, readHeader, sanitizeProxyServerLogValue, serializeProxyServerErrorForLog, serializeProxyServerErrorCauseForLog, summarizeProxyCallArgsForLog, buildConnectorMcpCallContext, classifyToolStatus, extractErrorCode, inferConnectorKind };
