'use strict';
const { registerServiceHandlers } = require('../server/service-handlers');
function registerSchedulerHandlers(registry, deps) { const service = deps.service ?? deps.scheduler; if (!service) throw new Error('scheduler service is required'); registerServiceHandlers(registry, 'scheduler', service); return registry; }
function registerSchedulerRuntimeHandlers(registry, deps) { return Promise.resolve(deps.cellDeps).then((cellDeps) => registerSchedulerHandlers(registry, { service: deps.createService?.(cellDeps, deps) })).catch((error) => deps.logger?.error?.('[SchedulerService] registration failed:', String(error))); }
module.exports = Object.freeze({ registerSchedulerHandlers, registerSchedulerRuntimeHandlers });
