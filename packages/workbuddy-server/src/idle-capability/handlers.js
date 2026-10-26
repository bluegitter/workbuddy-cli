'use strict';

function registerIdleCapabilityHandlers(registry, deps) {
  const service = 'service' in deps ? Promise.resolve(deps.service) : Promise.resolve(deps.createService?.(deps));
  registry.handle('idleCapability:recordUsage', async (observation) => (await service).recordUsage(observation));
  registry.handle('idleCapability:recordActiveDay', async () => (await service).recordActiveDay());
  registry.handle('idleCapability:getIdleCardData', async (installed) => (await service).getIdleCardData(installed));
  registry.handle('idleCapability:markShown', async () => (await service).markShown());
  registry.handle('idleCapability:dismiss', async (type, id) => (await service).dismiss(type, id));
  registry.handle('idleCapability:dismissGlobal', async () => (await service).dismissGlobal());
  registry.handle('idleCapability:forgetCapability', async (type, id) => (await service).forgetCapability(type, id));
  registry.handle('idleCapability:listCandidates', async (installed, options) => (await service).listCandidates(installed, options));
}
module.exports = Object.freeze({ registerIdleCapabilityHandlers });
