'use strict';

const assert = require('node:assert/strict');

const metric = require('../packages/workbuddy-server/src/connector/connector-mcp-proxy-metric');
const states = require('../packages/workbuddy-server/src/connector/connector-states-persistence');
const cache = require('../packages/workbuddy-server/src/connector/json-file-cache');

assert.equal(typeof metric.ConnectorMetricReporter, 'function');
assert.equal(typeof metric.setConnectorMetricReporter, 'function');
assert.equal(typeof states.readStates, 'function');
assert.equal(typeof states.writeStates, 'function');
assert.equal(typeof cache.JsonFileCache, 'function');
assert.equal(typeof cache.safeReadJsonFile, 'function');

console.log('connector original source path tests passed');
