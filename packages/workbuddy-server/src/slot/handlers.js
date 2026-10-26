'use strict';

function registerSlotRuntimeHandlers(registry, deps) {
  registry.handle('slot:getActiveConfigs', async (options) => deps.service.getActiveConfigs(options));
  registry.handle('slot:getActiveConfig', async (slotKey, options) => deps.service.getActiveConfig(slotKey, options));
}

module.exports = Object.freeze({ registerSlotRuntimeHandlers });
