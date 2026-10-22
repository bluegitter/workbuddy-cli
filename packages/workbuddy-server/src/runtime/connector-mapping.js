'use strict';

const CONNECTOR_ROUTE_PREFIX = '/console/as/connector';

function createApiError(envelope, operation) {
  const error = new Error(envelope?.message || envelope?.msg || `${operation} failed`);
  error.name = 'ConnectorApiError';
  error.code = envelope?.code;
  return error;
}
function hasApiCode(value) { return typeof value === 'number' || typeof value === 'string'; }
function unwrapData(response, operation) {
  const nested = response?.data;
  const envelope = hasApiCode(response?.code) ? response : hasApiCode(nested?.code) ? nested : response;
  if (hasApiCode(envelope?.code) && String(envelope.code) !== '0') throw createApiError(envelope, operation);
  return envelope?.data;
}

function mapRegistryItem(raw = {}) {
  const data = raw.data || {};
  return { id: raw.id, name: raw.name || '', scope: raw.scope, authType: raw.auth_type, status: raw.status, capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : undefined, displayName: data.display_name ?? raw.display_name ?? raw.name ?? '', description: data.description ?? raw.description ?? '', iconUrl: data.icon_url ?? raw.icon_url ?? null, isConnected: Boolean(raw.is_connected ?? raw.isConnected), data, mcp: raw.mcp };
}
function mapUserConnector(raw = {}) {
  const repos = Array.isArray(raw.repos) ? raw.repos : typeof raw.repos === 'string' ? raw.repos.split(',').filter(Boolean) : undefined;
  return { ...raw, name: raw.name || '', displayName: raw.display_name ?? raw.displayName ?? raw.name ?? '', description: raw.description || '', connectStatus: Number(raw.connect_status ?? raw.connectStatus ?? 0) === 1, activeStatus: Number(raw.active_status ?? raw.activeStatus ?? 0) === 1, repos, url: raw.url, oauthClientId: raw.oauth_client_id ?? raw.oauthClientId, oauthRedirectUrl: raw.oauth_redirect_url ?? raw.oauthRedirectUrl, oauthAppName: raw.oauth_app_name ?? raw.oauthAppName, prompt: raw.prompt };
}
function mapProjectConnector(raw = {}) {
  return { connectorName: raw.connector_name ?? raw.connectorName ?? raw.name ?? '', displayName: raw.display_name ?? raw.displayName ?? raw.connector_name ?? raw.name ?? '', description: raw.description || '', iconUrl: raw.icon_url ?? raw.iconUrl ?? null, authMode: raw.auth_mode ?? raw.authMode ?? 'personal', configuredBy: raw.configured_by ?? raw.configuredBy ?? raw.created_by ?? raw.createdBy ?? null, configuredByName: raw.configured_by_name ?? raw.configuredByName ?? raw.created_by_name ?? raw.createdByName ?? null, connectedAccount: raw.connected_account ?? raw.connectedAccount ?? null, isConnected: Boolean(raw.is_connected ?? raw.isConnected ?? raw.connect_status ?? raw.connectStatus) };
}
function mapProjectUserConnectorPreference(raw = {}) { return { name: raw.name ?? raw.connector_name ?? raw.connectorName ?? '', authMode: raw.auth_mode ?? raw.authMode ?? 'personal', activeStatus: Number(raw.active_status ?? raw.activeStatus ?? 1) === 1 }; }
function mapTaskConnector(raw = {}) { const rawAuthMode = raw.auth_mode ?? raw.authMode; return { taskId: raw.task_id ?? raw.taskId ?? '', name: raw.name || '', displayName: raw.display_name ?? raw.displayName ?? raw.name ?? '', authMode: typeof rawAuthMode === 'string' && rawAuthMode ? rawAuthMode : 'personal', activeStatus: Number(raw.active_status ?? raw.activeStatus ?? 0) === 1, isConnected: Number(raw.connect_status ?? raw.connectStatus ?? 0) === 1, repos: typeof raw.repos === 'string' ? raw.repos : undefined }; }
function isConnectorAuthMode(value) { return value === 'personal' || value === 'public'; }
function mapProjectConnectorChange(raw, field) {
  if (!raw || typeof raw !== 'object') throw new Error(`update project connectors returned invalid ${field} item`);
  const connectorName = raw.connector_name ?? raw.connectorName ?? raw.name;
  const authMode = raw.auth_mode ?? raw.authMode;
  if (typeof connectorName !== 'string' || !connectorName.trim()) throw new Error(`update project connectors returned ${field} item without connector_name`);
  if (!isConnectorAuthMode(authMode)) throw new Error(`update project connectors returned ${field} item with invalid auth_mode`);
  return { connectorName, authMode };
}
function mapProjectConnectorChanges(raw, field) { if (raw == null) return []; if (!Array.isArray(raw)) throw new Error(`update project connectors returned invalid ${field} list`); return raw.map((item) => mapProjectConnectorChange(item, field)); }
function buildRegistryQuery(params) { const query = new URLSearchParams(); if (params?.scope) query.set('scope', params.scope); if (params?.status) query.set('status', params.status); if (params?.mcpOnly) query.set('mcp_only', 'true'); if (params?.capability) query.set('capability', params.capability); if (params?.projectId) query.set('project_id', params.projectId); return query.toString(); }
function buildProjectQuery(projectId) { return projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''; }
function normalizeAuthConnectParams(params) { return typeof params === 'string' ? { authorizationCode: params } : params ?? {}; }

module.exports = { CONNECTOR_ROUTE_PREFIX, buildProjectQuery, buildRegistryQuery, createApiError, hasApiCode, isConnectorAuthMode, mapProjectConnector, mapProjectConnectorChange, mapProjectConnectorChanges, mapProjectUserConnectorPreference, mapRegistryItem, mapTaskConnector, mapUserConnector, normalizeAuthConnectParams, unwrapData };
