'use strict';

async function runWithConcurrencySettled(tasks, concurrency = 5) {
  if (!tasks.length) return [];
  const results = new Array(tasks.length);
  const limit = Math.min(tasks.length, Math.max(1, concurrency));
  let currentIndex = 0;
  async function worker() {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      try { results[index] = { status: 'fulfilled', value: await tasks[index]() }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

module.exports = Object.freeze({ runWithConcurrencySettled });
