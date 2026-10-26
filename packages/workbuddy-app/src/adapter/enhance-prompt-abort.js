'use strict';

const ENHANCE_PROMPT_ABORT_REASON = 'enhance-prompt-aborted-by-user';

function makeEnhancePromptAbortError() {
  const error = new Error(ENHANCE_PROMPT_ABORT_REASON);
  error.name = 'AbortError';
  return error;
}

function raceWithAbortSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(makeEnhancePromptAbortError());
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(makeEnhancePromptAbortError()); };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

module.exports = Object.freeze({ ENHANCE_PROMPT_ABORT_REASON, makeEnhancePromptAbortError, raceWithAbortSignal });
