'use strict';

const assert = require('node:assert');
const { bootstrapServer } = require('../packages/workbuddy-server/src/server/bootstrap-server');
const { DaemonServer } = require('../packages/workbuddy-server/src/server/daemon-server');

async function testBootstrap() {
  const calls = [];
  const sessionManager = { id: 'session-manager' };
  const server = { push: () => {} };
  const result = await bootstrapServer({
    backends: [{ id: 'default', name: 'Default', create: (params) => ({ params }) }],
    createSessionManager: () => sessionManager,
    createRpcServer: () => server,
    startRpcServer: async (value) => calls.push(['start', value]),
    createHandlerDeps: (value) => { calls.push(['deps', value]); return { ok: true }; },
    registerRpcHandlers: (value, deps) => calls.push(['handlers', value, deps]),
    setSessionEventSink: (value, sink) => calls.push(['sink', value, typeof sink]),
    initializeSessionManager: async (value, options) => { calls.push(['init', value, options.listBackends()[0].id]); },
    onRpcReady: async (value) => calls.push(['ready', value.server]),
    cleanupSessionManager: async () => calls.push(['cleanup']),
    stopRpcServer: async () => calls.push(['stop']),
  });
  assert.strictEqual(result.server, server);
  assert.strictEqual(result.sessionManager, sessionManager);
  assert.strictEqual(result.listBackends()[0].isDefault, true);
  assert.deepStrictEqual(calls.map((item) => item[0]), ['start', 'deps', 'handlers', 'sink', 'init', 'ready']);
  await result.stop();
  assert.deepStrictEqual(calls.map((item) => item[0]), ['start', 'deps', 'handlers', 'sink', 'init', 'ready', 'cleanup', 'stop']);

  const failureCalls = [];
  await assert.rejects(() => bootstrapServer({
    backends: [{ id: 'default', create: () => ({}) }],
    createSessionManager: () => ({}),
    createRpcServer: () => ({}),
    startRpcServer: async () => { throw new Error('start failed'); },
    createHandlerDeps: () => ({}),
    registerRpcHandlers: () => {},
    setSessionEventSink: () => {},
    initializeSessionManager: async () => {},
    cleanupSessionManager: async () => failureCalls.push('cleanup'),
    stopRpcServer: async () => failureCalls.push('stop'),
  }), /start failed/);
  assert.deepStrictEqual(failureCalls, ['cleanup', 'stop']);
}

async function testDaemonServer() {
  const events = [];
  const disconnected = [];
  const logger = { info: () => {}, warn: () => {} };
  const server = new DaemonServer({ logger });
  server.handle('echo', (value) => value);
  assert.strictEqual(await server.invokeLocal('echo', 'ok'), 'ok');
  const removePush = server.onPush((channel, data) => events.push([channel, data]));
  const removeDisconnected = server.onAllClientsDisconnected(() => disconnected.push(true));
  await server.start();
  server.push('event', { ok: true });
  server.stop();
  removePush();
  removeDisconnected();
  assert.deepStrictEqual(events, [['event', { ok: true }]]);
  assert.deepStrictEqual(disconnected, [true]);
  assert.strictEqual(server.started, false);
}

Promise.all([testBootstrap(), testDaemonServer()]).then(() => {
  console.log('server bootstrap and daemon tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
