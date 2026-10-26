'use strict';

const assert = require('node:assert');
const { wireWorkbuddyAppServerEventBridges } = require('../packages/workbuddy-server/src/server/app-server-event-bridges');

async function main() {
  const endpoint = { name: 'endpoint' };
  const sessionManager = {
    createSession: (params) => ({ method: 'createSession', params }),
    getSession: (id) => ({ id }),
    prompt: (id, contentBlocks, meta) => ({ id, contentBlocks, meta }),
    destroySession: (id) => id,
    respondToPermission: (sessionId, requestId, optionId) => ({ sessionId, requestId, optionId }),
    rejectPermission: (sessionId, requestId, reason) => ({ sessionId, requestId, reason }),
  };
  let bridgeDeps;
  let resumed;
  wireWorkbuddyAppServerEventBridges({
    endpoint,
    sessionManager,
    mediaArtifactService: { name: 'media' },
    permissionRequests: new Map(),
    agentTeamsEnvResolver: { name: 'teams' },
    resolveCwdTrace: () => 'trace',
    resolveClawCwd: () => '/workspace',
    resumeSessionExecuting: (sessionId, media) => { resumed = [sessionId, media]; },
    celljs: {
      authService: { getAccount: () => ({ uid: 'u-1' }) },
      productConfiguration: { name: 'product' },
      expertCenterService: { name: 'expert' },
      sessionRuntimeEventService: { name: 'events' },
      expertPluginService: { name: 'plugins' },
      clawService: { name: 'claw' },
    },
    registerDaemonEventBridgeHandlers: (target, deps) => { bridgeDeps = { target, deps }; },
  });
  assert.strictEqual(bridgeDeps.target, endpoint);
  assert.strictEqual(bridgeDeps.deps.sessionRuntimeEvents.getCurrentUserId(), 'u-1');
  assert.strictEqual(bridgeDeps.deps.sessionRuntimeEvents.getClawCwd(), '/workspace');
  assert.deepStrictEqual(bridgeDeps.deps.clawReplyBridge.sessionManager.getSession('s1'), { id: 's1' });
  bridgeDeps.deps.clawReplyBridge.onPermissionApproved('s1');
  assert.strictEqual(resumed[0], 's1');

  const errors = [];
  wireWorkbuddyAppServerEventBridges({ logger: { error: (...args) => errors.push(args) }, registerDaemonEventBridgeHandlers: () => { throw new Error('bridge failed'); } });
  assert.strictEqual(errors.length, 1);
  console.log('app server event bridge tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
