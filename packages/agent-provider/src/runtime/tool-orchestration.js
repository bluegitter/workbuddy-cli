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
      results.push(...await Promise.all(batch.calls.map((call) => executeToolCall(call, context))));
    } else {
      for (const call of batch.calls) results.push(await executeToolCall(call, context));
    }
  }
  return results;
}

module.exports = { partitionToolCalls, runTools };
