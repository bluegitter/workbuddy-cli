'use strict';

const { getAccessToken, getOapiAccessToken } = require('./dingtalk-support');

const DINGTALK_META = Object.freeze({ displayName: 'DingTalk', transport: 'websocket', isDualMode: true });
const DINGTALK_CAPABILITIES = Object.freeze({ sendText: true, sendMarkdown: true, sendMedia: true, interactive: true, streaming: true, groupChat: true, threading: false });
const DINGTALK_REPLY_POLICY = Object.freeze({ mode: 'all' });

class DingTalkConfigAdapter {
  resolveAccount(rawConfig = {}) {
    const appKey = rawConfig.appKey;
    const appSecret = rawConfig.appSecret;
    if (!appKey || !appSecret) throw new Error('DingTalk: appKey and appSecret are required');
    return { accountId: `dingtalk-${appKey}`, displayName: `DingTalk (${appKey.substring(0, 8)}...)`, credential: { appKey, appSecret }, platformMeta: { connectionMode: rawConfig.connectionMode ?? 'websocket', requireMention: rawConfig.requireMention ?? true } };
  }
  getConfigSchema() { return { type: 'object', required: ['appKey', 'appSecret'], properties: { appKey: { type: 'string', title: 'App Key' }, appSecret: { type: 'string', title: 'App Secret', format: 'password' }, requireMention: { type: 'boolean' } } }; }
}

function createDingTalkConnectionError(message, errorCode) { const error = new Error(message); error.errorCode = errorCode; return error; }
function classifyDingTalkError(error, fallback = 'UNKNOWN') { const status = error?.response?.status; const message = error?.message || String(error || ''); if ([400, 401, 403].includes(status) || /\b(400|401|403)\b/.test(message) || /auth|invalid.*secret|invalid.*app/i.test(message)) return 'AUTH_FAILED'; if (/timeout|timed out/i.test(message)) return 'TIMEOUT'; if (/^(ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|EHOSTUNREACH)$/i.test(error?.code || '')) return 'NETWORK'; return fallback; }

function createDingtalkPlugin(deps = {}) {
  const gateway = deps.gateway || deps.createGateway?.(deps.logger) || { stopAccount: async () => {}, getConnectionState: () => ({ status: 'stopped' }) };
  const outbound = deps.outbound || deps.createOutbound?.(gateway, deps.logger) || { clearState: () => {} };
  const originalStopAccount = gateway.stopAccount?.bind(gateway);
  if (originalStopAccount) gateway.stopAccount = async (...args) => { outbound.clearState?.(); return originalStopAccount(...args); };
  return { id: 'dingtalk', meta: DINGTALK_META, capabilities: DINGTALK_CAPABILITIES, config: new DingTalkConfigAdapter(), gateway, outbound, defaultReplyPolicy: DINGTALK_REPLY_POLICY };
}

module.exports = Object.freeze({ DINGTALK_META, DINGTALK_CAPABILITIES, DINGTALK_REPLY_POLICY, DingTalkConfigAdapter, createDingTalkConnectionError, classifyDingTalkError, createDingtalkPlugin, getAccessToken, getOapiAccessToken });
