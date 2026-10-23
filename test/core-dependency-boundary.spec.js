'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'packages/workbuddy-core/package.json'),
  'utf8',
));
const commonSource = fs.readFileSync(
  path.join(root, 'packages/workbuddy-core/src/source/common.js'),
  'utf8',
);

assert.strictEqual(manifest.dependencies['reflect-metadata'], '^0.1.13');
assert.strictEqual(manifest.dependencies.semver, '^7.7.2');
assert.strictEqual(manifest.dependencies.axios, '^1.13.6');
assert.match(commonSource, /require\("reflect-metadata"\)/);
assert.match(commonSource, /module\.exports = require\("semver"\)/);
assert.match(commonSource, /module\.exports = require\("axios"\)/);
assert.match(
  commonSource,
  /require\("reflect-metadata"\);[\s\S]*?Reflect\$1 = typeof globalThis/,
);

require('reflect-metadata');
const target = {};
Reflect.defineMetadata('workbuddy:test', 42, target);
assert.strictEqual(Reflect.getMetadata('workbuddy:test', target), 42);

console.log('core dependency boundary verified');
