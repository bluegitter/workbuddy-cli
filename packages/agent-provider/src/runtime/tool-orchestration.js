'use strict';

const { executeToolCall } = require('./tool-execution');

function partitionToolCalls(calls, tools) {
  return calls.reduce((batches, call) => {
    const tool = tools.get(call.name);
    const concurrent = Boolean(tool?.isConcurrencySafe?.(call.input));
    const previous = batches[batches.length - 1];
    if (concurrent && previous?.concurrent) previous.calls.push(call);
    else batches.push({ concurrent, calls: [call] });
    return batches;
  }, []);
}

async function runTools(calls, context) {
  const results = [];
  for (const batch of partitionToolCalls(calls, context.tools)) {
    if (batch.concurrent) {
      results.push(...await mapWithConcurrency(batch.calls, context.maxToolConcurrency || 10, (call) => executeToolCall(call, context)));
    } else {
      for (const call of batch.calls) results.push(await executeToolCall(call, context));
    }
  }
  return results;
}

async function mapWithConcurrency(items, limit, mapper) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('concurrency limit must be a positive integer');
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

module.exports = { mapWithConcurrency, partitionToolCalls, runTools };
