'use strict';
const assert = require('node:assert');
const { IDLE_CAPABILITY_STATE_FILENAME } = require('../packages/workbuddy-server/src/idle-capability/types');
const { LICENSE_ON_CHANGE_CHANNEL } = require('../packages/workbuddy-server/src/license/types');
const { isClawWorkspacePath } = require('../packages/workbuddy-server/src/workspace/claw-workspace-path');
const { createPerfFacade } = require('../packages/workbuddy-server/src/perf/facade');
const { createConnectorOAuthCallbackFacade } = require('../packages/workbuddy-server/src/connector-oauth/facade');
async function main() {
  assert.strictEqual(IDLE_CAPABILITY_STATE_FILENAME, 'usage-log.json'); assert.strictEqual(LICENSE_ON_CHANGE_CHANNEL, 'license:onChange'); assert(isClawWorkspacePath('/tmp/Claw/session')); assert(!isClawWorkspacePath('/tmp/clawhouse'));
  const calls = []; const perf = createPerfFacade({ getLogger: () => ({ appendRendererLine: (...args) => calls.push(args), flush: () => calls.push(['flush']), getLogFilePath: () => '/tmp/perf' }) }); perf.appendLine('x', '{}'); perf.flush('x'); assert.deepStrictEqual(calls, [['{}'], ['flush']]);
  const facade = createConnectorOAuthCallbackFacade({ connectorMcpProxy: { isOAuthCallbackUrl: () => true, handleOAuthCallbackFromUrl: async () => 'url', handleOAuthCallback: async () => 'code' } }); assert.strictEqual(facade.isOAuthCallbackUrl('x'), true); assert.strictEqual(await facade.handleOAuthCallback('s', 'c'), 'code');
  console.log('server small modules tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
