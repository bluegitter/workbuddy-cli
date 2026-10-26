'use strict';

function registerConfigHandlers(registry, deps) {
  const services = Promise.resolve(deps.services);
  const config = () => services.then((value) => value.config);
  registry.handle('config:get', async (key) => (await config()).get(key));
  registry.handle('config:set', async (key, value) => { await (await config()).set(key, value); });
  registry.handle('config:getAll', async () => (await config()).getAll());
  registry.handle('config:getProductScenes', async (locale) => (await config()).getProductScenes(locale));
  registry.handle('config:getProductConfiguration', async () => (await config()).getProductConfiguration());
  registry.handle('config:getClientMenus', async () => (await config()).getClientMenus());
  registry.handle('config:getLocalCustomModels', async () => (await config()).getLocalCustomModels());
  registry.handle('config:saveLocalCustomModel', async (request) => (await config()).saveLocalCustomModel(request));
  registry.handle('config:deleteLocalCustomModel', async (modelId) => (await config()).deleteLocalCustomModel(modelId));
}

function registerConfigProductConfigurationEventBridge(publisher, source, pushEvent = (target, payload) => target.push('config:productConfigurationChanged', payload)) {
  let pending = false;
  let inFlight = false;
  let missedChange = false;
  const publishLatest = () => {
    if (pending) { if (inFlight) missedChange = true; return; }
    pending = true;
    queueMicrotask(() => {
      inFlight = true;
      Promise.resolve(source.getProductConfiguration()).then((productConfiguration) => pushEvent(publisher, { timestamp: Date.now(), productConfiguration })).catch(() => undefined).finally(() => {
        pending = false; inFlight = false;
        if (missedChange) { missedChange = false; publishLatest(); }
      });
    });
  };
  return source.onProductConfigurationChanged(() => publishLatest());
}

module.exports = Object.freeze({ registerConfigHandlers, registerConfigProductConfigurationEventBridge });
