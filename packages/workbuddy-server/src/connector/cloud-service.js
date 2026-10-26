'use strict';

const mapping = require('../runtime/connector-mapping');
const ROUTE = '/console/as/connector';
class ConnectorCloudService {
  constructor({ context }) { this.http = context.http; }
  async getConnectors() { return (mapping.unwrapData(await this.http.get(`${ROUTE}/user/`), 'get user connectors')?.connectors || []).map(mapping.mapUserConnector).filter((item) => item.name); }
  setUserConnectorActiveStatus(name, activeStatus) { return mapping.unwrapData(this.http.patch(`${ROUTE}/user/${encodeURIComponent(name)}/active_status`, { name, active_status: activeStatus ? 1 : 0 }), 'set user connector active status'); }
  async listRegistry(params) { return { list: (mapping.unwrapData(await this.http.get(`${ROUTE}/registry2c/list?${mapping.buildRegistryQuery(params)}`), 'list connector registry')?.list || []).map(mapping.mapRegistryItem).filter((item) => item.name) }; }
  registry2cList(params) { return this.listRegistry(params); }
  async listProjectConnectors(projectId) { return { connectors: (mapping.unwrapData(await this.http.get(`${ROUTE}/project/${encodeURIComponent(projectId)}`), 'list project connectors')?.connectors || []).map(mapping.mapProjectConnector).filter((item) => item.connectorName) }; }
  async listProjectUserConnectorPreferences(projectId) { return { connectors: (mapping.unwrapData(await this.http.get(`${ROUTE}/project/${encodeURIComponent(projectId)}/user_preference`), 'list project user connector preferences')?.connectors || []).map(mapping.mapProjectUserConnectorPreference).filter((item) => item.name) }; }
  updateProjectUserConnectorPreferences(projectId, params) { return mapping.unwrapData(this.http.post(`${ROUTE}/project/${encodeURIComponent(projectId)}/user_preference`, { connectors: params.connectors.map((item) => ({ name: item.name, auth_mode: item.authMode, active_status: item.activeStatus ? 1 : 0 })) }), 'update project user connector preferences'); }
  addProjectConnector(projectId, params) { return mapping.unwrapData(this.http.post(`${ROUTE}/project/${encodeURIComponent(projectId)}`, { connector_name: params.connectorName, auth_mode: params.authMode }), 'add project connector'); }
  updateProjectConnectors(projectId, params) { return this.http.put(`${ROUTE}/project/${encodeURIComponent(projectId)}`, { connectors: params.connectors.map((item) => ({ connector_name: item.connectorName, auth_mode: item.authMode })) }).then((response) => { const data = mapping.unwrapData(response, 'update project connectors'); return { added: mapping.mapProjectConnectorChanges(data.added, 'added'), removed: mapping.mapProjectConnectorChanges(data.removed, 'removed') }; }); }
  removeProjectConnector(projectId, connectorName, authMode) { return mapping.unwrapData(this.http.delete(`${ROUTE}/project/${encodeURIComponent(projectId)}/${encodeURIComponent(connectorName)}?auth_mode=${encodeURIComponent(authMode)}`), 'remove project connector'); }
  async listTaskConnectors(taskId) { return { connectors: (mapping.unwrapData(await this.http.get(`${ROUTE}/task/${encodeURIComponent(taskId)}`), 'list task connectors')?.connectors || []).map(mapping.mapTaskConnector).filter((item) => item.name) }; }
  authStart(name) { return this.http.post(`/console/as/connector/oauth/${name}/start`, {}); }
  authStatus(name) { return this.http.get(`/console/as/connector/oauth/${name}/status`); }
  authRevoke(name) { return mapping.unwrapData(this.http.post(`/console/as/connector/oauth/${name}/revoke`, {}), 'auth revoke'); }
}
module.exports = { ConnectorCloudService, CONNECTOR_ROUTE_PREFIX: ROUTE };
