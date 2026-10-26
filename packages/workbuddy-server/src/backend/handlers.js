'use strict';
function registerBackendsHandlers(registry, deps) { registry.handle('backend:list', () => deps.listBackends()); }
module.exports = Object.freeze({ registerBackendsHandlers });
