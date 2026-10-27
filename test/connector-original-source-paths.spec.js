'use strict';

const assert = require('node:assert/strict');

const metric = require('../packages/workbuddy-server/src/connector/connector-mcp-proxy-metric');
const states = require('../packages/workbuddy-server/src/connector/connector-states-persistence');
const cache = require('../packages/workbuddy-server/src/connector/json-file-cache');
const poiHeader = require('../packages/workbuddy-server/src/connector/poi-header-builder');
const userinfo = require('../packages/workbuddy-server/src/runtime/userinfo-provider');
const documentLifecycle = require('../packages/workbuddy-server/src/session/tencent-docs-document-lifecycle-port');
const { ConnectorCliExecutor, semverGte } = require('../packages/workbuddy-server/src/connector/connector-cli-executor');

assert.equal(typeof metric.ConnectorMetricReporter, 'function');
assert.equal(typeof metric.setConnectorMetricReporter, 'function');
assert.equal(typeof states.readStates, 'function');
assert.equal(typeof states.writeStates, 'function');
assert.equal(typeof cache.JsonFileCache, 'function');
assert.equal(typeof cache.safeReadJsonFile, 'function');
assert.equal(typeof poiHeader.buildPoiHeader, 'function');
assert.equal(typeof userinfo.DefaultUserinfoProvider, 'function');
assert.equal(typeof documentLifecycle.createIsSessionStillProcessing, 'function');
assert.equal(semverGte('1.2.0', '1.1.9'), true);
const executor = new ConnectorCliExecutor({ logger: { warn() {}, info() {} } });
assert.equal(typeof executor.runInstall, 'function');
assert.equal(typeof executor.runAuth, 'function');
assert.equal(typeof executor.runAuthStep, 'function');
assert.equal(executor.extractExecutable("'cli tool' --flag"), 'cli tool');
assert.equal(executor.extractExecutable('cli | malicious'), 'cli');
assert.equal(executor.extractExecutable('"unterminated'), null);
assert.equal(executor.extractAuthUrl('open https://example.test/login now', 'example.test'), 'https://example.test/login');
assert.deepEqual(executor.extractDeviceFlowInfo('Visit https://example.test and code ABC-123', { uriPattern: '(https://\\S+)', codePattern: 'code\\s+([A-Z0-9-]+)' }), {
  verificationUri: 'https://example.test', userCode: 'ABC-123', expiresIn: undefined, codeEmbeddedInUri: undefined,
});

console.log('connector original source path tests passed');
