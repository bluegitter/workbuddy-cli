'use strict';

const SKILL_RECOMMEND_ABORT_REASON = 'skill-recommend-aborted-by-user';
function makeSkillRecommendAbortError() { const error = new Error(SKILL_RECOMMEND_ABORT_REASON); error.name = 'AbortError'; return error; }
function raceWithAbortSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(makeSkillRecommendAbortError());
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(makeSkillRecommendAbortError()); };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

module.exports = Object.freeze({ SKILL_RECOMMEND_ABORT_REASON, makeSkillRecommendAbortError, raceWithAbortSignal });
