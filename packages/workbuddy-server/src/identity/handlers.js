'use strict';

function registerIdentityHandlers(registry, deps) {
  const service = deps.service ?? deps.createService?.(deps);
  if (!service) throw new Error('Identity service is required');
  registry.handle('identity:getName', () => service.getIdentityName());
  registry.handle('identity:updateName', (name) => service.updateIdentityName(name));
  registry.handle('identity:checkModeration', (params) => service.checkModeration(params));
  registry.handle('identity:getLocalMemoryFiles', () => service.getLocalMemoryFiles());
  registry.handle('identity:updateUserCallName', (name) => service.updateUserCallName(name));
  registry.handle('identity:updateAiName', (name) => service.updateAiName(name));
  registry.handle('identity:updateSoulBody', (body) => service.updateSoulBody(body));
  registry.handle('identity:updateMemoryBody', (body) => service.updateMemoryBody(body));
}
module.exports = Object.freeze({ registerIdentityHandlers });
