'use strict';

function createWorkbuddyServerHttpFetch(fetchImpl = globalThis.fetch.bind(globalThis)) {
  return (url, init) => fetchImpl(url, init);
}

module.exports = Object.freeze({ createWorkbuddyServerHttpFetch });
