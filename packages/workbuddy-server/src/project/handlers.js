'use strict';
const { registerServiceHandlers } = require('../server/service-handlers');
function registerProjectHandlers(registry, deps) { const service = deps.service ?? deps.project; if (!service) throw new Error('project service is required'); registerServiceHandlers(registry, 'project', service); return registry; }
function registerProjectRuntimeHandlers(registry, deps) { return Promise.resolve(deps.cellDeps).then((cellDeps) => registerProjectHandlers(registry, { service: deps.createService?.(cellDeps, deps) })).catch((error) => deps.logger?.error?.('[ProjectService] registration failed:', String(error))); }
module.exports = Object.freeze({ registerProjectHandlers, registerProjectRuntimeHandlers });
