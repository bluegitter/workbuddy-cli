'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..', 'packages', 'agent-ui');
const indexSource = fs.readFileSync(path.join(packageRoot, 'src', 'index.js'), 'utf8');
const ui = require(path.join(packageRoot, 'src'));

assert.ok(!indexSource.includes('require.resolve("./source/renderer-entry.js")'));
assert.strictEqual(ui.RENDERER_ENTRY_ASSET, 'renderer/index.html');
assert.deepStrictEqual(ui.RENDERER_RUNTIME_DEPENDENCIES, ['react', 'react-dom', 'zustand']);
assert.strictEqual(ui.resolveRendererAsset('/tmp/app'), '/tmp/app/renderer/index.html');
assert.strictEqual(ui.resolveRendererAsset('/tmp/app/'), '/tmp/app/renderer/index.html');
console.log('agent ui renderer boundary tests passed');
