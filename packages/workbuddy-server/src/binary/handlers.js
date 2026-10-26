'use strict';
function registerBinariesHandlers(registry, deps) { const services = Promise.resolve(deps.services); registry.handle('binary:list', async () => (await services).binaries.list()); registry.handle('binary:status', async () => (await services).binaries.getStatus()); }
module.exports = Object.freeze({ registerBinariesHandlers });
