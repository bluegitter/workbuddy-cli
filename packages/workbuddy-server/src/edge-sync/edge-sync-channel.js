'use strict';

const os = require('os');
const crypto = require('crypto');

function resolveTraceSampled(traceContext) { return traceContext?.sampled !== undefined ? traceContext.sampled : true; }
function logger(ctx) { return ctx.logger || { info() {}, warn() {}, error() {} }; }
async function fetchChannelCredentials(ctx, unwrapResponse, extraScopes = [], traceContext) {
  const deviceId = ctx.deps.getDeviceId();
  const userId = ctx.deps.getAccount()?.uid || '';
  const body = { userId, deviceId, clientType: 'desktop', deviceName: os.hostname(), useDefaultScopes: true, ...(extraScopes.length ? { scopes: extraScopes } : {}) };
  logger(ctx).info(`[EdgeSync] CHANNEL-CREDS: fetching userId=${userId} deviceId=${deviceId} deviceName=${body.deviceName} extraScopes=${JSON.stringify(extraScopes)}`);
  const headers = traceContext ? { traceparent: `00-${traceContext.traceId}-${traceContext.spanId}-${resolveTraceSampled(traceContext) ? '01' : '00'}`, 'X-B3-TraceId': traceContext.traceId, 'X-B3-SpanId': traceContext.spanId, 'X-B3-Sampled': resolveTraceSampled(traceContext) ? '1' : '0', 'x-trace-id': traceContext.traceId } : undefined;
  const raw = await ctx.deps.http.post('/edge-cloud/credentials', body, headers ? { headers } : undefined);
  const data = unwrapResponse(raw, 'CHANNEL-CREDS');
  if (data?.apisixPublishUrl) data.apisixPublishUrl = data.apisixPublishUrl.replace('staging-copilot.tencent.com', 'staging.workbuddy.cn');
  if (data?.cfWsUrl) data.cfWsUrl = data.cfWsUrl.replace('staging-copilot.tencent.com', 'staging.workbuddy.cn');
  logger(ctx).info(`[EdgeSync] CHANNEL-CREDS urls: apisixPublishUrl=${data?.apisixPublishUrl} cfWsUrl=${data?.cfWsUrl}`);
  return data;
}
async function refreshChannelKeys(ctx) {
  const sdk = ctx.rawSdkRef;
  const credManager = sdk?.credManager;
  if (!credManager || typeof credManager.start !== 'function') return;
  logger(ctx).info('[EdgeSync] CHANNEL-KEYS: refreshing credentials for new channels...');
  try {
    await credManager.start();
    logger(ctx).info('[EdgeSync] CHANNEL-KEYS: refresh OK');
  } catch (error) {
    logger(ctx).warn(`[EdgeSync] CHANNEL-KEYS: refresh failed: ${error?.message || String(error)}`);
  }
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
  ctx.edgeLog?.('DEVICE_ONLINE_SEND', `channel=user:${account.uid}:devices deviceId=${payload.deviceId}`);
  return result && typeof result.then === 'function' ? result.then(() => true, () => false) : true;
}

module.exports = Object.freeze({ resolveTraceSampled, fetchChannelCredentials, refreshChannelKeys, buildDeviceOnlinePayload, reportDeviceOnline });
