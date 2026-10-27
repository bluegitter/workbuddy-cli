'use strict';

const assert = require('node:assert');
const { createSessionTerminalTelemetryReporter, bootstrapWorkbuddyAppServer } = require('../packages/workbuddy-server/src/server/app-server-bootstrap');

async function main() {
  const warnings = [];
  const reported = [];
  const reporter = createSessionTerminalTelemetryReporter({
    eventService: { report: async (...args) => { reported.push(args); throw new Error('telemetry unavailable'); } },
  }, { warn: (...args) => warnings.push(args) });
  reporter('terminal.done', { sessionId: 's1' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(reported, [['terminal.done', { sessionId: 's1' }]]);
  assert.strictEqual(warnings.length, 1);

  const calls = [];
  const fakeInstance = { server: { id: 'rpc' }, sessionManager: { id: 'session' }, stop: async () => { calls.push('stop'); } };
  const result = await bootstrapWorkbuddyAppServer({
    celljs: { id: 'cell' },
    createCoreServices: async (args) => { calls.push(['core', args.celljs.id]); return { id: 'core' }; },
    attachHostCapabilities: (args) => calls.push(['host', args.celljs.id]),
    createHandlerDeps: (args) => { calls.push(['deps', args.coreServices.id]); return { ok: true }; },
    registerRpcHandlers: (_server, deps) => calls.push(['rpc', deps.ok]),
    setSessionEventSink: () => calls.push('sink'),
    initializeSessionManager: (_manager, args) => calls.push(['session', args.coreServices.id]),
    bootstrapServer: async (options) => {
      calls.push('bootstrap');
      const deps = options.createHandlerDeps({ server: {}, sessionManager: {}, listBackends: () => [] });
      options.registerRpcHandlers({}, deps);
      options.setSessionEventSink({}, () => {});
      await options.initializeSessionManager({}, { createBackend: () => {} });
      return fakeInstance;
    },
  });
  assert.deepStrictEqual(calls, [['host', 'cell'], ['core', 'cell'], 'bootstrap', ['deps', 'core'], ['rpc', true], 'sink', ['session', 'core']]);
  assert.strictEqual(result.coreServices.id, 'core');
  await result.stop();
  assert.strictEqual(calls.at(-1), 'stop');
  console.log('app server bootstrap tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
