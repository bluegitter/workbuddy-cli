'use strict';

function createPendingOpenUrlQueue({ summarize = () => undefined, onConsume = () => {} } = {}) {
  let listenerReady = false;
  const pending = [];
  return {
    enqueue(url) {
      if (typeof url !== 'string' || !url) return false;
      if (pending[pending.length - 1] === url) return false;
      pending.push(url);
      return true;
    },
    markReady() { listenerReady = true; return this.consume(); },
    isReady() { return listenerReady; },
    consume() {
      if (!pending.length) return [];
      const urls = pending.splice(0, pending.length).map((url) => ({ url }));
      onConsume({ count: urls.length, latest: summarize(urls[urls.length - 1].url) });
      return urls;
    },
    peek() { return pending.slice(); },
    clear() { pending.length = 0; },
  };
}

function createPendingFileQueue() {
  const files = [];
  return {
    enqueue(filePath) { if (filePath && !files.includes(filePath)) files.push(filePath); return files.length; },
    consume() { return files.splice(0, files.length); },
    peek() { return files.slice(); },
  };
}

module.exports = { createPendingFileQueue, createPendingOpenUrlQueue };
