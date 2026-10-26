'use strict';

const {
  registerWorkbuddyDaemonEventBridgeHandlers,
} = require('./daemon-runtime-handlers');
const { resolveClawCwd: defaultResolveClawCwd } = require('../workspace/default-workspace-root');

function missingDependency(name) {
  return () => { throw new Error(`App server event bridge dependency is not available: ${name}`); };
}

function wireWorkbuddyAppServerEventBridges(options = {}) {
  const logger = options.logger || console;
  const celljs = options.celljs || {};
  const resolveClawCwd = options.resolveClawCwd || defaultResolveClawCwd;
  const resumeSessionExecuting = options.resumeSessionExecuting || missingDependency('resumeSessionExecuting');
  const registerEventBridges = options.registerDaemonEventBridgeHandlers || registerWorkbuddyDaemonEventBridgeHandlers;

  try {
    registerEventBridges(options.endpoint, {
      authStatus: { authService: celljs.authService },
      productConfiguration: celljs.productConfiguration,
      expertLoadState: { expertCenterService: celljs.expertCenterService },
      sessionRuntimeEvents: {
        runtimeEvents: celljs.sessionRuntimeEventService,
        expertResolver: celljs.expertPluginService,
        agentTeams: options.agentTeamsEnvResolver,
        getCurrentUserId: () => {
          const account = celljs.authService?.getAccount?.();
          return typeof account?.uid === 'string' ? account.uid : undefined;
        },
        getClawCwd: resolveClawCwd,
        logger,
      },
      clawReplyBridge: {
        clawService: celljs.clawService,
        sessionManager: {
          createSession: (params) => options.sessionManager.createSession({ ...params, permissionMode: params.permissionMode }),
          getSession: (id) => options.sessionManager.getSession(id),
          prompt: (id, contentBlocks, meta) => options.sessionManager.prompt(id, contentBlocks, meta),
          destroySession: (id) => options.sessionManager.destroySession(id),
          respondToPermission: (sessionId, requestId, optionId) => options.sessionManager.respondToPermission(sessionId, requestId, optionId),
          rejectPermission: (sessionId, requestId, reason) => options.sessionManager.rejectPermission(sessionId, requestId, reason),
        },
        permissionRequests: options.permissionRequests,
        publisher: options.endpoint,
        resolveCwd: resolveClawCwd,
        onPermissionApproved: (sessionId) => resumeSessionExecuting(sessionId, options.mediaArtifactService),
        logger,
        resolveCwdTrace: options.resolveCwdTrace,
      },
      sessionPermissionBridge: {
        permissions: celljs.clawService,
        onApproved: (sessionId) => resumeSessionExecuting(sessionId, options.mediaArtifactService),
        logger,
      },
    });
  } catch (error) {
    logger.error?.('[Daemon] Failed to subscribe to CellJS events:', error);
  }
}

module.exports = Object.freeze({ wireWorkbuddyAppServerEventBridges });
