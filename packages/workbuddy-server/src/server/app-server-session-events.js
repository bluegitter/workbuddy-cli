'use strict';

function createMediaLifecycleLogger(logger = console) {
  const fallback = console;
  return { debug: (...args) => (logger.debug || logger.info || fallback.debug)(...args) };
}

function attachWorkbuddyAppServerSessionEvents(options = {}) {
  const logger = options.logger || console;
  const pushEvent = (channel, eventData) => options.sink?.(channel, eventData);
  const mediaArtifactService = options.createMediaArtifactService
    ? options.createMediaArtifactService({ pushEvent, configDir: options.configDir, localDocumentMediaTypes: options.localDocumentMediaTypes, logger })
    : options.mediaArtifactService;
  const fileWatchService = options.createFileWatchService
    ? options.createFileWatchService(pushEvent, { logger })
    : options.fileWatchService;
  options.registerConnectorEventBridge?.({ connectorService: options.celljs?.connectorService, sink: options.sink });
  const identityService = options.startIdentityBridge?.({ services: options.services, pushEvent, configDir: options.configDir, logger }) || options.identityService;
  const brainArtifactService = options.createBrainArtifactService?.({ configDir: options.configDir }) || options.brainArtifactService;
  const documentLifecycle = options.documentLifecycle;
  const eventSink = (channel, data) => options.handleSessionEvent?.({
    channel,
    data,
    sink: options.sink,
    permissionRequests: options.permissionRequests,
    imPermissions: options.celljs?.clawService,
    mediaArtifactService,
    brainArtifactService,
    documentLifecycle,
    clawCwd: options.clawCwd,
    lastKnownSessionStatus: options.lastKnownSessionStatus,
    taskCompletionNotifier: options.taskCompletionNotifier,
    taskCompletionLogger: options.taskCompletionLogger,
    scheduleRuntimeSweep: options.scheduleRuntimeSweep,
    logger,
  });
  options.sessionManager?.setEventSink?.(eventSink);
  return {
    mediaArtifactService,
    fileWatchService,
    identityService,
    detectReplayLifecycle: (channel, payload, push, replayingSessions, replayLogger = logger) => options.detectSessionLifecycle?.(mediaArtifactService, channel, payload, push, undefined, undefined, replayingSessions, undefined, createMediaLifecycleLogger(replayLogger)),
    dispose() {
      mediaArtifactService?.dispose?.(); identityService?.dispose?.(); fileWatchService?.dispose?.(); documentLifecycle?.dispose?.();
    },
  };
}

module.exports = { attachWorkbuddyAppServerSessionEvents, createMediaLifecycleLogger };
