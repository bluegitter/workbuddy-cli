'use strict';

const { handleRpc } = require('../server/handler-registry');
const { AgentImService } = require('./agent-im-service');

const CHANNELS = Object.freeze({
  LIST_BINDINGS: 'agentImListBindings', GET_BINDING: 'agentImGetBinding',
  WECHATBOT_PREBIND_CHECK: 'agentImWechatBotPrebindCheck', WECHATBOT_START_BIND: 'agentImWechatBotStartBind',
  WECHATBOT_GET_BIND_STATUS: 'agentImWechatBotGetBindStatus', WECHATBOT_UNBIND: 'agentImWechatBotUnbind',
  QQ_START_BIND: 'agentImQqStartBind', QQ_GET_BIND_STATUS: 'agentImQqGetBindStatus',
  QQ_MANUAL_BIND: 'agentImQqManualBind', QQ_CANCEL_BIND: 'agentImQqCancelBind', QQ_UNBIND: 'agentImQqUnbind',
  QQ_QR_UPDATE: 'agentImQqQrUpdate', QQ_QR_EXPIRED: 'agentImQqQrExpired', QQ_BIND_SUCCESS: 'agentImQqBindSuccess', QQ_BIND_FAILED: 'agentImQqBindFailed'
});

function fallbackLogger() { return { info: console.info, warn: console.warn, error: console.error, debug: console.debug }; }
function errorResult(error, extra = {}) { return { ...extra, success: false, message: error instanceof Error ? error.message : String(error) }; }

function registerAgentImHandlers(registry, deps = {}) {
  const logger = deps.logger || fallbackLogger();
  let servicePromise;
  const getService = () => {
    servicePromise ||= Promise.resolve(deps.service || deps.createService?.({ ...deps, logger, channels: CHANNELS }) || new AgentImService({ ...deps, logger }));
    return servicePromise.then((service) => { if (!service) throw new Error('agent-im service is required'); return service; });
  };
  const register = (channel, method) => handleRpc(registry, deps.channels?.[channel] || CHANNELS[channel], async (params) => { try { return await method(await getService(), params); } catch (error) { return errorResult(error, channel.includes('GET_BIND_STATUS') ? { bound: false } : {}); } });
  register('LIST_BINDINGS', (service, params) => service.listBindings(params || {}));
  register('GET_BINDING', (service, params) => service.getBinding(params));
  register('WECHATBOT_PREBIND_CHECK', (service, params) => service.wechatBotPrebindCheck(params));
  register('WECHATBOT_START_BIND', (service, params) => service.wechatBotStartBind(params));
  register('WECHATBOT_GET_BIND_STATUS', (service, params) => service.wechatBotGetBindStatus(params));
  register('WECHATBOT_UNBIND', (service, params) => service.wechatBotUnbind(params));
  register('QQ_START_BIND', (service, params) => service.qqStartBind(params));
  register('QQ_GET_BIND_STATUS', (service, params) => service.qqGetBindStatus(params));
  register('QQ_MANUAL_BIND', (service, params) => service.qqManualBind(params));
  register('QQ_CANCEL_BIND', (service, params) => service.qqCancelBind(params));
  register('QQ_UNBIND', (service, params) => service.qqUnbind(params));
  return registry;
}

module.exports = { CHANNELS, registerAgentImHandlers, fallbackLogger };
