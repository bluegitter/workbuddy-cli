'use strict';

const { registerServiceHandlers } = require('../server/service-handlers');

function registerCloudAssistantHandlers(registry, deps) {
  const service = deps.service ?? deps.createService?.({ context: deps.context });
  if (!service) throw new Error('Cloud assistant service is required');
  return registerServiceHandlers(registry, 'cloudAssistant', service, deps.options, deps.logger);
}
function registerCloudAssistantRuntimeHandlers(registry, deps) {
  const logger = deps.logger ?? console;
  Promise.resolve(deps.cellDeps).then((cellDeps) => {
    const context = deps.createContext?.(cellDeps, deps);
    registerCloudAssistantHandlers(registry, { ...deps, context });
  }).catch((error) => logger.error?.('[CloudAssistantService] registration failed:', String(error)));
}

module.exports = Object.freeze({ registerCloudAssistantHandlers, registerCloudAssistantRuntimeHandlers });
