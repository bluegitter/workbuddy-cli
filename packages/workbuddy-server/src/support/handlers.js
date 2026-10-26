'use strict';

function logSupport(logger, message, ...args) {
  if (logger?.log) { logger.log(message, ...args); return; }
  logger?.info?.(message, ...args);
}

function registerSupportHandlers(registry, deps) {
  registry.handle('support:getPresignedUrls', async (params) => {
    logSupport(deps.logger, '[PresignedURL:server] request params:', JSON.stringify(params));
    const result = await deps.context.http.post('/console/as/support/presigned_url', { object_keys: params.object_keys });
    logSupport(deps.logger, '[PresignedURL:server] response:', JSON.stringify(result));
    return result;
  });
}

function registerSupportRuntimeHandlers(registry, deps) {
  const logger = deps.logger ?? console;
  Promise.resolve(deps.cellDeps).then((cellDeps) => {
    registerSupportHandlers(registry, { context: deps.createContext(cellDeps, deps), logger });
  }).catch((error) => logger.error?.('[SupportService] registration failed:', String(error)));
}

module.exports = Object.freeze({ logSupport, registerSupportHandlers, registerSupportRuntimeHandlers });
