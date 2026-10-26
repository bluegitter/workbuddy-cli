'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'packages/workbuddy-server/package.json'),
  'utf8',
));
const initializeSource = fs.readFileSync(
  path.join(root, 'packages/workbuddy-server/src/source/initialize.js'),
  'utf8',
);

assert.strictEqual(manifest.dependencies.ws, '^8.18.0');
assert.match(initializeSource, /module\.exports = require\("ws"\)/);
assert.match(initializeSource, /module\.exports = require\("ws"\)\.WebSocketServer/);

const ws = require('ws');
assert.strictEqual(typeof ws, 'function');
assert.strictEqual(typeof ws.WebSocketServer, 'function');

console.log('server dependency boundary verified');
