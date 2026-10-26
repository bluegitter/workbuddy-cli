'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

async function main() {
  const accumulator = new app.ACPUserMessageChunkAccumulator();
  accumulator.addChunk('s', 'm', { type: 'text', text: 'a' });
  accumulator.addChunk('s', 'm', { type: 'text', text: 'b' });
  assert.deepStrictEqual(app.ACPUserMessageChunkAccumulator.coalesceAdjacentTextBlocks(accumulator.drain('s', 'm')[0].chunks), [{ type: 'text', text: 'ab' }]);
  const changes = [];
  const credit = new app.CreditUsageAccumulator({ onCreditChange: (...args) => changes.push(args) });
  assert.strictEqual(credit.accumulate('s', 'r', 1.006), 1.01);
  credit.hydrateFromPersistence('s', { r: 0.5, x: 2 });
  assert.strictEqual(credit.getCreditFor('s', 'r'), 1.01);
  assert.strictEqual(changes.length, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(app.raceWithAbortSignal(Promise.resolve(), controller.signal), { name: 'AbortError' });
  assert.strictEqual(app.formatPhaseType({ phase: 'tool_executing', toolName: 'shell' }), 'phase.tool_executing.shell');
  assert.strictEqual(app.isSessionWelcomeMode('design'), true);
  console.log('workbuddy app ACP utility tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
