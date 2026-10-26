'use strict';

const { t } = require('./claw-i18n');

const REJECT_PATTERN = /^(拒绝|不行?|不要|别搞?了?|取消|终止|停[下止]?|中[断止]|打住|[Nn]([Oo])?|[Rr][Ee][Jj][Ee][Cc][Tt]|否|❌|🚭|✋)\s*$/;
const ALWAYS_ALLOW_PATTERN = /^(始终(允许|执行)?|总是(允许|执行)?|永远(允许|执行)?|[Aa][Ll][Ww][Aa][Yy][Ss]( ?[Aa][Ll][Ll][Oo][Ww])?)\s*$/;
const ALLOW_PATTERN = /^(允许|运行|执行|确认|同意|批准|好的?|行吧?|可以|没问题|[Oo][Kk]|[Yy]([Ee][Ss])?|[Aa][Ll][Ll][Oo][Ww]|[Rr][Uu][Nn]( ?[Oo][Nn][Cc][Ee])?|是的?|对|搞|干|来吧?|冲|[Gg][Oo]|走起|开搞|👍|✅|✔)\s*$/;

function fullWidthToHalfWidth(text) {
  let result = '';
  for (const character of text) {
    const code = character.charCodeAt(0);
    result += code >= 0xff01 && code <= 0xff3e ? String.fromCharCode(code - 0xfee0) : code === 0x3000 ? ' ' : character;
  }
  return result;
}
function parseTextApproval(text) {
  if (typeof text !== 'string' || !text) return null;
  const normalized = fullWidthToHalfWidth(text).trim();
  if (!normalized) return null;
  if (REJECT_PATTERN.test(normalized)) return { decision: 'reject', originalText: text };
  if (ALWAYS_ALLOW_PATTERN.test(normalized)) return { decision: 'allow_always', originalText: text };
  if (ALLOW_PATTERN.test(normalized)) return { decision: 'allow', originalText: text };
  return null;
}
function buildApprovalConfirmationText(description, command) {
  return [t('approvalConfirmHeader'), '', t('approvalAboutToExecute'), '', t('approvalAction', { description }), t('approvalCommand', { command }), '', t('approvalReplyPrompt'), t('approvalRunHint'), t('approvalAlwaysAllowHint'), t('approvalRejectHint')].join('\n');
}
function buildApprovalResolvedText(description, decision, source) {
  const sourceLabel = source === 'local' ? t('approvalSourceLocal') : t('approvalSourceIM');
  if (decision === 'allow') return t('approvalApproved', { source: sourceLabel, description });
  if (decision === 'allow_always') return t('approvalApprovedAlways', { source: sourceLabel, description });
  if (decision === 'reject') return t('approvalRejected', { source: sourceLabel, description });
}
function buildApprovalFallbackText() {
  return [t('approvalFallbackLine1'), '', t('approvalFallbackLine2'), t('approvalFallbackRun'), t('approvalFallbackAlwaysAllow'), t('approvalFallbackReject')].join('\n');
}

class ClawApprovalRuntime {
  constructor(logger, timeoutMs = 180 * 1000) { this.logger = logger; this.timeoutMs = timeoutMs; this.pendingBySessionId = new Map(); this.timeoutHandles = new Map(); }
  createPending(params) {
    const now = Date.now(); const pending = { ...params, createdAt: now, expiresAt: now + this.timeoutMs, resolved: false };
    const queue = this.pendingBySessionId.get(params.sessionId) || []; if (!this.pendingBySessionId.has(params.sessionId)) this.pendingBySessionId.set(params.sessionId, queue); queue.push(pending);
    const key = `${params.sessionId}:${params.requestId}`; this.timeoutHandles.set(key, setTimeout(() => this.handleTimeout(params.sessionId, params.requestId), this.timeoutMs));
    this.logger.info?.(`[ClawApprovalRuntime] Created pending: sessionId=${params.sessionId}, requestId=${params.requestId}, tool=${params.toolName}, isHead=${queue.length === 1}, queueSize=${queue.length}, timeout=${this.timeoutMs}ms`);
    return { pending, isHead: queue.length === 1 };
  }
  resolve(sessionId, requestId, decision) { const pending = this.findPending(sessionId, requestId); if (!pending || pending.resolved) return false; pending.resolved = true; pending.resolvedDecision = decision; this.clearTimeoutByKey(`${sessionId}:${requestId}`); return true; }
  getPendingBySessionId(sessionId) { return this.pendingBySessionId.get(sessionId)?.find((pending) => !pending.resolved); }
  getPendingByRequestId(sessionId, requestId) { return this.findPending(sessionId, requestId); }
  hasPendingByRequestId(sessionId, requestId) { return !!this.findPending(sessionId, requestId); }
  dequeueAndGetNext(sessionId, requestId) { const queue = this.pendingBySessionId.get(sessionId); if (!queue) return; const index = queue.findIndex((pending) => pending.requestId === requestId); if (index >= 0) queue.splice(index, 1); this.clearTimeoutByKey(`${sessionId}:${requestId}`); if (!queue.length) { this.pendingBySessionId.delete(sessionId); return; } return queue.find((pending) => !pending.resolved); }
  cleanup(sessionId, requestId) { this.clearTimeoutByKey(`${sessionId}:${requestId}`); }
  cleanupSession(sessionId) { for (const pending of this.pendingBySessionId.get(sessionId) || []) this.clearTimeoutByKey(`${sessionId}:${pending.requestId}`); this.pendingBySessionId.delete(sessionId); }
  onTimeout(callback) { this.onTimeoutCallback = callback; }
  buildConfirmationText(pending) { return buildApprovalConfirmationText(pending.description, pending.command); }
  buildResolvedText(pending, decision, source) { return buildApprovalResolvedText(pending.description, decision, source); }
  buildFallbackText() { return buildApprovalFallbackText(); }
  dispose() { for (const key of this.timeoutHandles.keys()) this.clearTimeoutByKey(key); this.pendingBySessionId.clear(); }
  findPending(sessionId, requestId) { return this.pendingBySessionId.get(sessionId)?.find((pending) => pending.requestId === requestId); }
  handleTimeout(sessionId, requestId) { const pending = this.findPending(sessionId, requestId); if (!pending || pending.resolved) return; pending.resolved = true; pending.resolvedDecision = 'reject'; this.timeoutHandles.delete(`${sessionId}:${requestId}`); this.onTimeoutCallback?.(pending); }
  clearTimeoutByKey(key) { const handle = this.timeoutHandles.get(key); if (handle) { clearTimeout(handle); this.timeoutHandles.delete(key); } }
}

module.exports = { REJECT_PATTERN, ALWAYS_ALLOW_PATTERN, ALLOW_PATTERN, fullWidthToHalfWidth, parseTextApproval, buildApprovalConfirmationText, buildApprovalResolvedText, buildApprovalFallbackText, ClawApprovalRuntime };
