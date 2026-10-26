'use strict';

const { AgentMailService } = require('./service');
const { registerServiceHandlers } = require('../server/service-handlers');
const { createRuntimeContextFromCellDeps } = require('../server/runtime-http');

function createAuthHeadersProvider(cellDeps) {
  return () => {
    const session = cellDeps.authenticationManager?.currentSessionSubject?.getValue?.();
    const headers = {};
    if (session?.auth?.accessToken) headers.Authorization = `Bearer ${session.auth.accessToken}`;
    if (session?.account?.uid) headers['X-User-Id'] = session.account.uid;
    if (session?.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; }
    if (session?.auth?.domain) headers['X-Domain'] = session.auth.domain;
    return headers;
  };
}
function createLazyAgentMailFacade(deps) {
  let servicePromise;
  const getService = () => { servicePromise ??= Promise.resolve(deps.cellDeps).then((cellDeps) => new AgentMailService({ context: deps.contextFactory(cellDeps), getAuthHeaders: createAuthHeadersProvider(cellDeps) })); return servicePromise; };
  const methods = ['getState', 'sendSms', 'bind', 'deactivate', 'reactivate', 'getAdminUrl', 'getRealnameUrl', 'getRestStatus', 'listMessages', 'searchMessages', 'getMessageDetail', 'updateMessage', 'deleteMessage', 'listAttachments', 'downloadAttachment'];
  return Object.fromEntries(methods.map((method) => [method, (...args) => getService().then((service) => service[method](...args))]));
}
function registerAgentMailRuntimeHandlers(registry, deps) {
  const logger = deps?.logger ?? console;
  if (!deps) { logger.warn?.('[AgentMailService] registration skipped: runtime deps unavailable'); return; }
  registerServiceHandlers(registry, 'agentMail', createLazyAgentMailFacade({ ...deps, contextFactory: deps.contextFactory ?? ((cellDeps) => createRuntimeContextFromCellDeps(cellDeps, deps)) }));
}

module.exports = { createAuthHeadersProvider, createLazyAgentMailFacade, registerAgentMailRuntimeHandlers };
