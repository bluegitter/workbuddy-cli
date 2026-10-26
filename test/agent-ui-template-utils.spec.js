'use strict';

const assert = require('node:assert');
const ui = require('../packages/agent-ui');

function main() {
  const map = new Map([['/tmp/a.txt', { url: 'https://cdn/a.txt' }]]);
  const messages = [{ content: [{ text: '/tmp/a.txt' }, { text: 'unchanged' }] }];
  const replaced = ui.replaceLocalPathsInMessages(messages, map);
  assert.strictEqual(replaced[0].content[0].text, 'https://cdn/a.txt');
  assert.strictEqual(messages[0].content[0].text, '/tmp/a.txt');
  assert.strictEqual(ui.detectHostTheme({ documentElement: { getAttribute: () => 'vscode-dark', classList: { contains: () => false } }, body: { classList: { contains: () => false } } }), 'dark');
  console.log('agent ui template utility tests passed');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
