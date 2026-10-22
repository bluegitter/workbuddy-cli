'use strict';

const os = require('os');
const crypto = require('crypto');

function resolveTraceSampled(traceContext) { return traceContext?.sampled !== undefined ? traceContext.sampled : true; }
async function fetchChannelCredentials(ctx, unwrapResponse, extraScopes = [], traceContext) {
  const deviceId = ctx.deps.getDeviceId();
  const userId = ctx.deps.getAccount()?.uid || '';
  const body = { userId, deviceId, clientType: 'desktop', deviceName: os.hostname(), useDefaultScopes: true, ...(extraScopes.length ? { scopes: extraScopes } : {}) };
  const headers = traceContext ? { traceparent: `00-${traceContext.traceId}-${traceContext.spanId}-${resolveTraceSampled(traceContext) ? '01' : '00'}`, 'X-B3-TraceId': traceContext.traceId, 'X-B3-SpanId': traceContext.spanId, 'X-B3-Sampled': resolveTraceSampled(traceContext) ? '1' : '0', 'x-trace-id': traceContext.traceId } : undefined;
  const raw = await ctx.deps.http.post('/edge-cloud/credentials', body, headers ? { headers } : undefined);
  const data = unwrapResponse(raw, 'CHANNEL-CREDS');
  if (data?.apisixPublishUrl) data.apisixPublishUrl = data.apisixPublishUrl.replace('staging-copilot.tencent.com', 'staging.workbuddy.cn');
  if (data?.cfWsUrl) data.cfWsUrl = data.cfWsUrl.replace('staging-copilot.tencent.com', 'staging.workbuddy.cn');
  return data;
}
function buildDeviceOnlinePayload(ctx) {
  const account = ctx.deps.getAccount();
  if (!account?.uid) return undefined;
  const hostname = os.hostname();
  return { eventId: crypto.randomUUID(), type: 'device.online', deviceId: ctx.deps.getDeviceId(), deviceName: hostname, clientType: 'desktop', displayName: hostname, appVersion: ctx.deps.getAppVersion?.() || '0.0.0', ts: new Date().toISOString() };
}
function reportDeviceOnline(ctx) {
  const sdk = ctx.channelSdk || ctx.deps.getSdk?.();
  const account = ctx.deps.getAccount();
  if (!sdk || !account?.uid) return false;
  const payload = buildDeviceOnlinePayload(ctx);
  const result = sdk.send(`user:${account.uid}:devices`, payload);
  return result && typeof result.then === 'function' ? result.then(() => true, () => false) : true;
}

module.exports = Object.freeze({ resolveTraceSampled, fetchChannelCredentials, buildDeviceOnlinePayload, reportDeviceOnline });
