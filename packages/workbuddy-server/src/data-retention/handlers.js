'use strict';
const { DATA_RETENTION_RPC_CHANNELS } = require('./contract');
function registerDataRetentionHandlers(registry, deps) {
  const service = deps.service ?? deps.createService?.(deps);
  if (!service) throw new Error('Data retention service is required');
  registry.handle(DATA_RETENTION_RPC_CHANNELS.GET_STORAGE_USAGE, () => service.getStorageUsage());
  registry.handle(DATA_RETENTION_RPC_CHANNELS.GET_DISK_INFO, () => service.getDiskInfo());
  registry.handle(DATA_RETENTION_RPC_CHANNELS.GET_POLICY, () => service.getPolicy());
  registry.handle(DATA_RETENTION_RPC_CHANNELS.SET_POLICY, (policy, takeEffectFrom) => service.setPolicy(policy, takeEffectFrom));
  registry.handle(DATA_RETENTION_RPC_CHANNELS.GET_LAST_CLEANUP_RESULT, () => service.getLastCleanupResult());
  return service;
}
module.exports = Object.freeze({ registerDataRetentionHandlers });
