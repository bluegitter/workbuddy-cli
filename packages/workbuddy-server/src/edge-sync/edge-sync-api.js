'use strict';

const ROUTE_PREFIX = '/console/as/conversation-sync';
const MIGRATE_BATCH_SIZE = 500;
const noopLogger = { info() {}, warn() {} };
function logger(ctx) { return ctx.logger || noopLogger; }
function errorText(error) { return error?.message || String(error); }
function trace(ctx, tag, detail) { ctx.edgeLog?.(tag, detail); }

async function migrateOnStartup(ctx, sessions) {
  if (!sessions.length) return;
  trace(ctx, 'MIGRATE_ENTER', `sessions=${sessions.length} sampleSids=${sessions.slice(0, 3).map((session) => session.id).join(',')}`);
  const deviceId = ctx.deps.getDeviceId();
  const msgChannel = `convmsg:${ctx.deps.getAccount()?.uid || ''}`;
  const all = [];
  let anyBatchOk = false;
  for (let start = 0; start < sessions.length; start += MIGRATE_BATCH_SIZE) {
    const batch = sessions.slice(start, start + MIGRATE_BATCH_SIZE);
    const body = { migrationId: `${deviceId}-${Date.now()}-b${Math.floor(start / MIGRATE_BATCH_SIZE)}`, deviceId, schemaVersion: 0, sessions: batch.map((session) => {
      const item = { sessionId: session.id, conversationTitle: session.customTitle || session.title || '新任务', status: session.status || 'completed', workDir: session.cwd || '', createdAtMs: session.createdAt || Date.now(), updatedAtMs: session.updatedAt || Date.now(), lastActivityAtMs: session.lastActivityAt || Date.now(), clientContext: { localStatus: session.status || 'completed', sessionKind: session.isBackgroundAutomation ? 'automation' : 'manual', model: session.model || '', sourceMode: session.sourceMode || '', permissionMode: session.permissionMode || '', expert: { id: session.expertId || '', locale: session.expertLocale || '', runtimeIdentity: session.expertRuntimeIdentity || '', marketplace: session.expertMarketplace || '' } } };
      if (session.isPlayground != null) item.isPlayground = session.isPlayground ? 1 : 0;
      if (session.projectId) item.projectId = session.projectId;
      return item;
    }) };
    try {
      const data = ctx.unwrapResponse(await ctx.deps.http.post(`${ROUTE_PREFIX}/migrations/legacy`, body), 'MIGRATE');
      anyBatchOk = true;
      const seen = new Set();
      for (const [sid, result] of Object.entries(data?.results || {})) if (result?.conversationId) { ctx.setMapping(sid, result.conversationId, msgChannel); all.push({ sessionId: sid, conversationId: result.conversationId, msgChannel }); seen.add(sid); }
      for (let i = 0; i < batch.length && i < (data?.conversationIds || []).length; i += 1) if (!seen.has(batch[i].id) && data.conversationIds[i]) { ctx.setMapping(batch[i].id, data.conversationIds[i], msgChannel); all.push({ sessionId: batch[i].id, conversationId: data.conversationIds[i], msgChannel }); }
    } catch (error) { logger(ctx).warn(`[EdgeSync] MIGRATE failed: ${errorText(error)}`); }
  }
  if (all.length) ctx.upsertBatchMapping(all);
  if (anyBatchOk) { if (!ctx.hasChannelSdk()) ctx.retryChannelConnect(); require('fs').writeFileSync(ctx.migratedFlagPath, new Date().toISOString(), 'utf8'); }
}

async function syncCreateConversation(ctx, session) {
  trace(ctx, 'CREATE_ENTER', `sid=${session.id} title=${session.title || ''} cwd=${session.cwd || '(empty)'} projectId=${session.projectId || '(none)'}`);
  try {
    const body = { type: 'local', sessionId: session.id, name: session.customTitle || session.title || '新任务', conversationOrigin: 'legacy_workbuddy_local', workDir: session.cwd || '', isPlayground: session.isPlayground != null ? (session.isPlayground ? 1 : 0) : (session.cwd ? 0 : 1), clientContext: { localStatus: 'active', hostId: ctx.deps.getDeviceId(), sessionKind: session.isBackgroundAutomation ? 'automation' : 'manual', model: session.model || '', sourceMode: session.sourceMode || '', permissionMode: session.permissionMode || '', expert: { id: session.expertId || '', locale: session.expertLocale || '', runtimeIdentity: session.expertRuntimeIdentity || '', marketplace: session.expertMarketplace || '' } } };
    if (session.projectId) body.projectId = session.projectId;
    const data = ctx.unwrapResponse(await ctx.deps.http.post('/console/as/conversations/v2', body), 'CREATE');
    const conversationId = data?.id;
    if (conversationId) { const channel = `convmsg:${ctx.deps.getAccount()?.uid || ''}`; ctx.setMapping(session.id, conversationId, channel); ctx.upsertMapping(session.id, conversationId, channel); }
    if (!ctx.hasChannelSdk()) ctx.retryChannelConnect(); else if (conversationId) ctx.refreshChannelKeys();
    return conversationId;
  } catch (error) { logger(ctx).warn(`[EdgeSync] CREATE failed: ${errorText(error)}`); return undefined; }
}

async function listConversations(ctx, opts = {}) {
  const params = new URLSearchParams(); for (const key of ['type', 'sourceDeviceId', 'projectId', 'status', 'cursor']) if (opts[key]) params.set(key, opts[key]);
  for (const key of ['pageSize', 'sinceSyncVersion']) if (opts[key] !== undefined) params.set(key, String(opts[key]));
  for (const key of ['includeDeleted', 'includeOnlineFlag']) if (opts[key]) params.set(key, 'true');
  try { const data = ctx.unwrapResponse(await ctx.deps.http.get(`${ROUTE_PREFIX}/conversations${params.toString() ? `?${params}` : ''}`), 'LIST'); return { conversations: data?.conversations || [], nextCursor: data?.nextCursor, hasMore: data?.hasMore ?? false, onlineStatus: data?.onlineStatus }; }
  catch (error) { logger(ctx).warn(`[EdgeSync] LIST failed: ${errorText(error)}`); return { conversations: [], hasMore: false }; }
}
async function getConversationDetail(ctx, conversationId) { try { return ctx.unwrapResponse(await ctx.deps.http.get(`${ROUTE_PREFIX}/conversations/${conversationId}`), 'DETAIL')?.conversation || null; } catch (error) { logger(ctx).warn(`[EdgeSync] DETAIL failed: ${errorText(error)}`); return null; } }
async function getOnlineDevices(ctx) { try { const data = ctx.unwrapResponse(await ctx.deps.http.get(`${ROUTE_PREFIX}/devices/online`), 'DEVICES/ONLINE'); return { devices: data?.devices || [], cacheSource: data?.cacheSource }; } catch (error) { logger(ctx).warn(`[EdgeSync] DEVICES/ONLINE failed: ${errorText(error)}`); return { devices: [] }; } }
async function mutateConversation(ctx, sessionId, operation, body, label, remove) { const id = ctx.getConversationId(sessionId); if (!id) return; try { const url = `/console/as/conversations/${id}${operation ? `/${operation}` : ''}`; await ctx.deps.http.post(url, body); if (remove) { ctx.deleteMapping(sessionId); ctx.deletePersistentMapping(sessionId); } return id; } catch (error) { logger(ctx).warn(`[EdgeSync] ${label} failed: ${errorText(error)}`); return undefined; } }
const syncRenameConversation = (ctx, sid, title) => mutateConversation(ctx, sid, '', { title }, 'RENAME');
const syncDeleteConversation = (ctx, sid) => mutateConversation(ctx, sid, 'delete', undefined, 'DELETE', true);
const syncArchiveConversation = (ctx, sid) => mutateConversation(ctx, sid, 'archive', undefined, 'ARCHIVE');
const syncUnarchiveConversation = (ctx, sid) => mutateConversation(ctx, sid, 'unarchive', undefined, 'UNARCHIVE');
async function syncPinConversation(ctx, sessionId, op, beforeWhichId) { const id = ctx.getConversationId(sessionId); if (!id) return; try { const body = { op }; if (op === 'reorder' && beforeWhichId) body.beforeWhichId = beforeWhichId; const data = ctx.unwrapResponse(await ctx.deps.http.post(`/console/as/conversations/${id}/pin`, body), 'PIN'); return { conversationId: id, needFullReload: !!data?.needFullReload }; } catch (error) { logger(ctx).warn(`[EdgeSync] PIN failed: ${errorText(error)}`); return undefined; } }
async function syncMigratePins(ctx, sessionIds, deviceId) { const pins = sessionIds.map((sid) => ctx.getConversationId(sid)).filter(Boolean); if (!pins.length) return { migrated: 0, skipped: sessionIds.length }; try { const data = ctx.unwrapResponse(await ctx.deps.http.post(`${ROUTE_PREFIX}/migrations/pins`, { deviceId, pins }), 'MIGRATE_PINS'); return { migrated: data?.migrated ?? 0, skipped: data?.skipped ?? 0 }; } catch (error) { logger(ctx).warn(`[EdgeSync] MIGRATE_PINS failed: ${errorText(error)}`); return undefined; } }

module.exports = Object.freeze({ ROUTE_PREFIX, MIGRATE_BATCH_SIZE, migrateOnStartup, syncCreateConversation, listConversations, getConversationDetail, getOnlineDevices, syncRenameConversation, syncDeleteConversation, syncArchiveConversation, syncUnarchiveConversation, syncPinConversation, syncMigratePins });
