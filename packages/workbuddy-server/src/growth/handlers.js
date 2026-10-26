'use strict';
const { handleRpc } = require('../server/handler-registry');
function registerGrowthHandlers(registry, deps) { const service = Promise.resolve(deps.services).then((services) => services.growth); handleRpc(registry, 'growthGetBuddy', async () => (await service).getBuddy()); return registry; }
module.exports = Object.freeze({ registerGrowthHandlers });
