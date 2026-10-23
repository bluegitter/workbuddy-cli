'use strict';

function cloneObservableInput(input) {
  if (!input || typeof input !== 'object') return input;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(input); } catch {}
  }
  return Array.isArray(input) ? [...input] : { ...input };
}

function parseToolInput(tool, input) {
  return tool.parseInput ? tool.parseInput(input) : input;
}

function normalizeValidationResult(result) {
  if (!result || result.result !== false) return { valid: true };
  return {
    valid: false,
    message: typeof result.message === 'string' && result.message
      ? result.message
      : 'Tool input validation failed',
    errorCode: typeof result.errorCode === 'number' ? result.errorCode : undefined,
  };
}

/**
 * Prepare the input exposed to hooks, permission checks, and tool execution.
 * The model-provided object is never mutated, which preserves callers that
 * retain the original request for retries or prompt-cache accounting.
 */
async function prepareToolInput(tool, rawInput, context) {
  try {
    const observableInput = cloneObservableInput(rawInput);
    tool.backfillObservableInput?.(observableInput);
    const input = parseToolInput(tool, observableInput);
    const validation = normalizeValidationResult(await tool.validateInput?.(input, context));
    return validation.valid
      ? { ok: true, input }
      : { ok: false, ...validation };
  } catch (error) {
    return {
      ok: false,
      valid: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = Object.freeze({
  cloneObservableInput,
  normalizeValidationResult,
  parseToolInput,
  prepareToolInput,
});
