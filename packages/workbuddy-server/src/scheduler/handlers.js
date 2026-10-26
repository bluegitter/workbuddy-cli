'use strict';
const { registerServiceHandlers } = require('../server/service-handlers');
const { SchedulerService } = require('./service');
function registerSchedulerHandlers(registry, deps) { const service = deps.service ?? deps.scheduler ?? (deps.context ? new SchedulerService({ context: deps.context, routePrefix: deps.routePrefix }) : null); if (!service) throw new Error('scheduler service is required'); registerServiceHandlers(registry, 'scheduler', service); return registry; }
function registerSchedulerRuntimeHandlers(registry, deps) { return Promise.resolve(deps.cellDeps).then((cellDeps) => registerSchedulerHandlers(registry, { service: deps.createService?.(cellDeps, deps), context: deps.createContext?.(cellDeps, deps), routePrefix: deps.routePrefix })).catch((error) => deps.logger?.error?.('[SchedulerService] registration failed:', String(error))); }
module.exports = Object.freeze({ registerSchedulerHandlers, registerSchedulerRuntimeHandlers });
