'use strict';

const { wrapCall } = require('../../../infra/wb-error');
const { wrapArray } = require('../../../sdk/helpers/shape');

function createWBConnectorsFromManager(manager) {
  const call = (name, operation) => wrapCall(`wb.connectors.${name}`, operation);
  return {
    list: () => call('list', async () => wrapArray(await manager.getConfigs())),
    states: () => call('states', () => manager.getStates()),
    connect: (id, options) => call('connect', () => manager.connect(id, options)),
    connectCustomMcpServer: (params) => call('connectCustomMcpServer', () => manager.connectCustomMcpServer(params)),
    disconnect: (id) => call('disconnect', () => manager.disconnect(id)),
    unbind: (id) => call('unbind', () => manager.unbind(id)),
    reset: (id) => call('reset', () => manager.reset(id)),
    authStart: (name) => call('authStart', () => manager.authStart(name)),
    authStatus: (name) => call('authStatus', () => manager.authStatus(name)),
    authAccessToken: (name) => call('authAccessToken', () => manager.authAccessToken(name)),
    authRevoke: (name, params) => call('authRevoke', () => manager.authRevoke(name, params)),
    authConnect: (name, params) => call('authConnect', () => manager.authConnect(name, params)),
    updateHeaders: (id, headers) => call('updateHeaders', () => manager.updateHeaders(id, headers)),
    updateEnv: (id, env) => call('updateEnv', () => manager.updateEnv(id, env)),
  };
}

module.exports = Object.freeze({ createWBConnectorsFromManager });
