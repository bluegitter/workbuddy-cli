'use strict';

const { bootstrapServer: defaultBootstrapServer } = require('./bootstrap-server');

function createSessionTerminalTelemetryReporter(celljs = {}, logger = console) {
  return (eventName, payload) => {
    try {
      const eventService = celljs.eventService;
      if (typeof eventService?.report !== 'function') return;
      Promise.resolve(eventService.report.call(eventService, eventName, payload)).catch((error) => {
        logger?.warn?.('[SessionManager] terminal task telemetry failed', error);
      });
    } catch (error) {
      logger?.warn?.('[SessionManager] terminal task telemetry failed', error);
    }
  };
}

/** Dependency-injected boundary for the generated app-server bootstrap. */
async function bootstrapWorkbuddyAppServer(options = {}) {
  const {
    celljs,
    logger = console,
    attachHostCapabilities,
    hostCapabilities,
    createCoreServices,
    createHandlerDeps,
    registerRpcHandlers,
    setSessionEventSink,
    initializeSessionManager,
    cleanupSessionManager,
    bootstrapServer = defaultBootstrapServer,
    ...bootstrapOptions
  } = options;

  attachHostCapabilities?.(hostCapabilities || { celljs, ...bootstrapOptions });
  const coreServices = createCoreServices
    ? await createCoreServices({ celljs, ...bootstrapOptions })
    : undefined;

  const instance = await bootstrapServer({
    ...bootstrapOptions,
    createHandlerDeps: ({ server, sessionManager, listBackends }) => createHandlerDeps?.({
      server, sessionManager, listBackends, celljs, coreServices, logger,
    }) || {},
    registerRpcHandlers: (server, deps) => registerRpcHandlers?.(server, deps, { celljs, coreServices, logger }),
    setSessionEventSink: (sessionManager, sink) => setSessionEventSink?.(sessionManager, sink, { celljs, coreServices, logger }),
    initializeSessionManager: (sessionManager, context) => initializeSessionManager?.(sessionManager, {
      ...context, celljs, coreServices, logger,
    }),
    cleanupSessionManager,
  });

  return { ...instance, coreServices, async stop() { await instance.stop(); } };
}

module.exports = Object.freeze({ createSessionTerminalTelemetryReporter, bootstrapWorkbuddyAppServer });
