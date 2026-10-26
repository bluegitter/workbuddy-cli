'use strict';

const { handleRpc } = require('../server/handler-registry');
const { reportLoginStep } = require('./auth-metric');
const { createWorkbuddyAuthService } = require('./service');

const STATUS_CHANGED = 'authStatusChanged';

function createService(deps, registry, reporter) {
  if (deps.service) return deps.service;
  const factory = deps.createService || createWorkbuddyAuthService;
  return factory({
    ...deps,
    reporter,
    onAuthUrlChanged: (payload) => registry.push('authUrlChanged', payload),
    onBrowserOpenFailed: () => registry.push('browserOpenFailed', {}),
    onLoginStep: (step, dims) => reportLoginStep(reporter, step, dims)
  });
}

function registerAuthHandlers(registry, deps = {}) {
  const reporter = deps.reporter;
  const service = createService(deps, registry, reporter);
  const methods = {
    authGetAccountUsage: () => service.getAccountUsage(),
    authGetAmbassadorStatus: () => service.getAmbassadorStatus(),
    authGetCheckinStatus: () => service.getCheckinStatus(),
    authClaimDailyCheckin: () => service.claimDailyCheckin(),
    authGetActivityBanner: () => service.getActivityBanner(),
    logout: () => service.logout(),
    getAccount: () => service.getAccount(),
    getToken: () => service.getToken(),
    authRefreshToken: () => service.refreshToken(),
    login: (params) => service.login(params)
  };
  for (const [name, handler] of Object.entries(methods)) handleRpc(registry, name, handler);
  return registry;
}

function registerAuthStatusEventBridge(publisher, deps) {
  const service = deps?.authService;
  if (!service?.onStateChanged) throw new Error('authService is required');
  service.onStateChanged((status) => publisher.push(STATUS_CHANGED, status));
}

module.exports = { registerAuthHandlers, registerAuthStatusEventBridge, STATUS_CHANGED };
