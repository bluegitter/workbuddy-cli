'use strict';

const { createBackend, createListBackends } = require('../backend/factory');

async function bootstrapServer(options = {}) {
  const backendOptions = {
    backends: options.backends,
    defaultBackendId: options.defaultBackendId,
  };
  const createConfiguredBackend = (params) => createBackend(backendOptions, params);
  const listBackends = createListBackends(backendOptions);
  const sessionManager = options.createSessionManager();
  const server = options.createRpcServer();
  let handlerDeps;

  try {
    await options.startRpcServer(server);
    handlerDeps = options.createHandlerDeps({ server, sessionManager, listBackends });
    options.registerRpcHandlers(server, handlerDeps);
    options.setSessionEventSink(sessionManager, server.push.bind(server));
    await options.initializeSessionManager(sessionManager, {
      server,
      createBackend: createConfiguredBackend,
      listBackends,
    });
    await options.onRpcReady?.({ server, sessionManager, handlerDeps, listBackends });
  } catch (error) {
    await Promise.resolve(options.cleanupSessionManager?.(sessionManager)).catch(() => {});
    await options.stopRpcServer?.(server);
    throw error;
  }

  return {
    server,
    sessionManager,
    listBackends,
    handlerDeps,
    stop: async () => {
      await options.cleanupSessionManager?.(sessionManager);
      await options.stopRpcServer?.(server);
    },
  };
}

module.exports = Object.freeze({ bootstrapServer });
