declare const require: (moduleName: string) => any;

import type { ToolCall } from '../../types/message';

interface ToolLike {
  parseInput?: (input: unknown) => unknown;
  isConcurrencySafe?: (input: unknown) => boolean;
}

interface ToolContext {
  tools: Map<string, ToolLike>;
  signal?: AbortSignal;
  maxToolConcurrency?: number;
  [key: string]: unknown;
}

interface ToolBatch {
  concurrent: boolean;
  calls: ToolCall[];
}

const { executeToolCall } = require('../../runtime/tool-execution');

export function partitionToolCalls(
  calls: ToolCall[],
  tools: Map<string, ToolLike>,
): ToolBatch[] {
  return calls.reduce<ToolBatch[]>((batches, call) => {
    const tool = tools.get(call.name || '');
    let concurrent = false;
    if (tool?.isConcurrencySafe) {
      try {
        const parsed = tool.parseInput ? tool.parseInput(call.input) : call.input;
        concurrent = Boolean(tool.isConcurrencySafe(parsed));
      } catch {
        // A malformed input must not be allowed to enter a parallel batch.
        concurrent = false;
      }
    }
    const previous = batches[batches.length - 1];
    if (concurrent && previous?.concurrent) previous.calls.push(call);
    else batches.push({ concurrent, calls: [call] });
    return batches;
  }, []);
}

export async function runTools(calls: ToolCall[], context: ToolContext): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const batch of partitionToolCalls(calls, context.tools)) {
    if (context.signal?.aborted) break;
    if (batch.concurrent) {
      results.push(...await mapWithConcurrency(
        batch.calls,
        context.maxToolConcurrency || 10,
        (call) => executeToolCall(call, context),
      ));
    } else {
      for (const call of batch.calls) results.push(await executeToolCall(call, context));
    }
  }
  return results;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R> | R,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('concurrency limit must be a positive integer');
  }
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
