'use strict';
const { registerServiceHandlers } = require('../server/service-handlers');
const { ModelsService } = require('./service');
function registerModelsHandlers(registry, deps) { return registerServiceHandlers(registry, 'models', deps.service ?? new ModelsService({ context: deps.context }), deps.options, deps.logger); }
function registerModelsRuntimeHandlers(registry, deps) { const logger = deps.logger ?? console; Promise.resolve(deps.cellDeps).then((cellDeps) => registerModelsHandlers(registry, { ...deps, context: deps.createContext(cellDeps, deps) })).catch((error) => logger.error?.('[ModelsService] registration failed:', String(error))); }
module.exports = Object.freeze({ registerModelsHandlers, registerModelsRuntimeHandlers });
