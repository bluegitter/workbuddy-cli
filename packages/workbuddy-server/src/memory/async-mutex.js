'use strict';

const mutexes = new Map();

async function acquireMutex(key) {
  const previous = mutexes.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  mutexes.set(key, previous.then(() => current));
  await previous;
  return release;
}

module.exports = { acquireMutex };
