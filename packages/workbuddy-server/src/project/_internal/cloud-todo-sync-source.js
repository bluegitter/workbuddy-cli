'use strict';

const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');

function endpoint(projectId) {
  return `${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/plan/todos/sync-sources`;
}

function stringValue(value) {
  if (typeof value !== 'string') return undefined;
  const result = value.trim();
  return result || undefined;
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normalizeSyncSource(raw, operation) {
  if (!raw || typeof raw !== 'object') throw new Error(`${operation} returned empty syncSource`);
  return {
    id: stringValue(raw.id ?? raw.syncSourceId ?? raw.sync_source_id) || '',
    projectId: stringValue(raw.projectId ?? raw.project_id) || '',
    connector: stringValue(raw.connector) || '',
    displayName: stringValue(raw.displayName ?? raw.display_name),
    target: stringValue(raw.target) || '',
    targetName: stringValue(raw.targetName ?? raw.target_name),
    syncIntervalMin: numberValue(raw.syncIntervalMin ?? raw.sync_interval_min) || 0,
    filterConfig: stringValue(raw.filterConfig ?? raw.filter_config),
    schedulerTaskId: numberValue(raw.schedulerTaskId ?? raw.scheduler_task_id),
    status: stringValue(raw.status) || 'DISABLED',
    creatorId: stringValue(raw.creatorId ?? raw.creator_id) || '',
    lastSyncedAt: raw.lastSyncedAt ?? raw.last_synced_at,
    createdAt: (raw.createdAt ?? raw.created_at) || '',
    updatedAt: (raw.updatedAt ?? raw.updated_at) || '',
  };
}

function normalizeTarget(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const path = stringValue(raw.path);
  return path ? { path, name: stringValue(raw.name) || path, description: stringValue(raw.description), webUrl: stringValue(raw.webUrl ?? raw.web_url) } : undefined;
}

async function listTodoSyncSources(http, projectId) {
  const data = unwrap(await http.get(endpoint(projectId)), 'list todo sync sources');
  return Array.isArray(data.syncSources) ? data.syncSources.map((item) => normalizeSyncSource(item, 'list todo sync sources')) : [];
}

async function listTodoSyncSourceTargets(http, projectId, params) {
  const connector = encodeURIComponent(String(params.connector || '').trim());
  const data = unwrap(await http.get(`${endpoint(projectId)}/targets?connector=${connector}`), 'list todo sync source targets');
  return Array.isArray(data.targets) ? data.targets.map(normalizeTarget).filter(Boolean) : [];
}

async function createTodoSyncSource(http, projectId, params) {
  const body = { connector: String(params.connector || '').trim(), target: params.target, syncIntervalMin: params.syncIntervalMin };
  if (params.filterConfig?.trim()) body.filterConfig = params.filterConfig.trim();
  const data = unwrap(await http.post(endpoint(projectId), body), 'create todo sync source');
  return normalizeSyncSource(data.syncSource, 'create todo sync source');
}

async function generateTodoSyncSourceFilterConfig(http, projectId, params) {
  return unwrap(await http.post(`${endpoint(projectId)}/generate-filter-config`, { connector: String(params.connector || '').trim(), prompt: params.prompt }), 'generate todo sync source filter config');
}

async function updateTodoSyncSource(http, projectId, id, params) {
  const data = unwrap(await http.put(`${endpoint(projectId)}/${encodeURIComponent(id)}`, params), 'update todo sync source');
  return normalizeSyncSource(data.syncSource, 'update todo sync source');
}

async function updateTodoSyncSourceStatus(http, projectId, id, params) {
  const data = unwrap(await http.patch(`${endpoint(projectId)}/${encodeURIComponent(id)}/status`, params), 'update todo sync source status');
  return normalizeSyncSource(data.syncSource, 'update todo sync source status');
}

async function deleteTodoSyncSource(http, projectId, id) {
  unwrap(await http.delete(`${endpoint(projectId)}/${encodeURIComponent(id)}`), 'delete todo sync source');
}

async function testTodoSyncSourceFilterConfig(http, projectId, params) {
  const body = { connector: String(params.connector || '').trim(), target: params.target };
  if (params.filterConfig?.trim()) body.filterConfig = params.filterConfig.trim();
  return unwrap(await http.post(`${endpoint(projectId)}/test-filter-config`, body), 'test todo sync source filter config');
}

module.exports = {
  listTodoSyncSources,
  listTodoSyncSourceTargets,
  createTodoSyncSource,
  generateTodoSyncSourceFilterConfig,
  updateTodoSyncSource,
  updateTodoSyncSourceStatus,
  deleteTodoSyncSource,
  testTodoSyncSourceFilterConfig,
};
