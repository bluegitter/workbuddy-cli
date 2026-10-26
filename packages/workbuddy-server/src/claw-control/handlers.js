'use strict';

const { ClawControlService } = require('./service');
const { wireClawForceDisconnect } = require('./force-disconnect');

function registerClawControlRuntimeHandlers(registry, deps = {}) {
  const logger = deps.logger || console;
  const servicePromise = Promise.resolve(deps.cellDeps).then((cellDeps = {}) => {
    const service = new ClawControlService({
      authenticationManager: cellDeps.authenticationManager,
      restOperations: cellDeps.restOperations || deps.restOperations,
      productManager: cellDeps.productManager,
      logger,
    });
    service.start();
    if (registry.push) service.clawControl$.subscribe((value) => registry.push('clawControl:onChange', value));
    if (deps.getClawService) Promise.resolve(deps.getClawService()).then((clawService) => wireClawForceDisconnect(service.clawControl$, clawService, logger)).catch((error) => logger.warn?.('[ClawControl] force-disconnect wiring failed:', String(error)));
    return service;
  });
  registry.handle('clawControl:getSnapshot', () => servicePromise.then((service) => service.getSnapshot()));
  registry.handle('clawControl:refresh', () => servicePromise.then((service) => service.refresh()));
  servicePromise.catch((error) => logger.error?.('[ClawControl] registration failed:', String(error)));
  return servicePromise;
}

module.exports = { registerClawControlRuntimeHandlers };
