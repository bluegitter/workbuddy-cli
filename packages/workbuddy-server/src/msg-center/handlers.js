'use strict';
const { registerServiceHandlers } = require('../server/service-handlers');
function registerMsgCenterHandlers(registry, deps) { const service = deps.service ?? deps.msgCenter; if (!service) throw new Error('msgCenter service is required'); registerServiceHandlers(registry, 'msgCenter', service); return registry; }
function registerMsgCenterRuntimeHandlers(registry, deps) { return Promise.resolve(deps.cellDeps).then((cellDeps) => registerMsgCenterHandlers(registry, { service: deps.createService?.(cellDeps, deps) })).catch((error) => { deps.logger?.error?.('[MsgCenterService] registration failed:', String(error)); }); }
module.exports = Object.freeze({ registerMsgCenterHandlers, registerMsgCenterRuntimeHandlers });
