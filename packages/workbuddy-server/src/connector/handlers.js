'use strict';
const { registerServiceHandlers } = require('../server/service-handlers');
const { ConnectorDesktopService } = require('./desktop-service');
function registerConnectorHandlers(registry, deps = {}) { const service = deps.service || new ConnectorDesktopService({ context: deps.context, resolveOauthName: deps.resolveOauthName }); return registerServiceHandlers(registry, 'connector', service, { excludeMethods: ['oauthRepos', 'registry2cList'] }); }
function registerConnectorRuntimeHandlers(registry, deps = {}) { return Promise.resolve(deps.cellDeps).then((cellDeps) => registerConnectorHandlers(registry, { context: deps.createContext?.(cellDeps, deps), resolveOauthName: (id) => cellDeps.connectorService.resolveOauthName(id) })).catch((error) => deps.logger?.error?.('[ConnectorService] registration failed:', String(error))); }
module.exports = { registerConnectorHandlers, registerConnectorRuntimeHandlers };
