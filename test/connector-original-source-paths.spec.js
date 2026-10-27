'use strict';

const assert = require('node:assert/strict');

const metric = require('../packages/workbuddy-server/src/connector/connector-mcp-proxy-metric');
const states = require('../packages/workbuddy-server/src/connector/connector-states-persistence');
const cache = require('../packages/workbuddy-server/src/connector/json-file-cache');
const poiHeader = require('../packages/workbuddy-server/src/connector/poi-header-builder');
const userinfo = require('../packages/workbuddy-server/src/runtime/userinfo-provider');
const documentLifecycle = require('../packages/workbuddy-server/src/session/tencent-docs-document-lifecycle-port');

assert.equal(typeof metric.ConnectorMetricReporter, 'function');
assert.equal(typeof metric.setConnectorMetricReporter, 'function');
assert.equal(typeof states.readStates, 'function');
assert.equal(typeof states.writeStates, 'function');
assert.equal(typeof cache.JsonFileCache, 'function');
assert.equal(typeof cache.safeReadJsonFile, 'function');
assert.equal(typeof poiHeader.buildPoiHeader, 'function');
assert.equal(typeof userinfo.DefaultUserinfoProvider, 'function');
assert.equal(typeof documentLifecycle.createIsSessionStillProcessing, 'function');

console.log('connector original source path tests passed');
