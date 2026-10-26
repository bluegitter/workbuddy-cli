'use strict';

const { WBError } = require('../../../infra/wb-error');

const SWR_DEFAULTS = Object.freeze({ maxAge: 300 * 1000, dedupingInterval: 2000, fallbackOnError: true });

function createSwr(getStorage) {
  const inflight = new Map();
  const ensureStorage = () => {
    const storage = getStorage();
    if (!storage) throw new WBError("wb.utils.swr requires wb.storage to be provided. Call wb.$provide('storage', impl) first.", { code: 'NOT_READY', source: 'utils.swr' });
    return storage;
  };
  const swr = (key, fetcher, onData, options) => {
    ensureStorage();
    const opts = { ...SWR_DEFAULTS, ...options };
    let unsubscribed = false;
    let currentValue;
    const safeOnData = (data) => { if (!unsubscribed) { currentValue = data; onData(data); } };
    const readCache = async () => {
      const entry = await ensureStorage().get(key);
      return entry ? entry.data : undefined;
    };
    const revalidate = async () => {
      const existing = inflight.get(key);
      if (existing && Date.now() - existing.ts < opts.dedupingInterval) { safeOnData(await existing.promise); return; }
      const promise = fetcher();
      inflight.set(key, { promise, ts: Date.now() });
      try {
        const data = await promise;
        await ensureStorage().set(key, { ts: Date.now(), data });
        safeOnData(data);
      } catch (error) {
        if (!(opts.fallbackOnError && currentValue !== undefined)) throw error;
      } finally {
        setTimeout(() => { if (inflight.get(key)?.promise === promise) inflight.delete(key); }, opts.dedupingInterval);
      }
    };
    (async () => {
      try { const cached = await readCache(); if (cached !== undefined) safeOnData(cached); } catch {}
      try { await revalidate(); } catch {}
    })();
    return {
      mutate: async () => { inflight.delete(key); await revalidate(); },
      unsubscribe: () => { unsubscribed = true; },
      get current() { return currentValue; },
    };
  };
  swr.invalidate = async (key) => ensureStorage().delete(key);
  swr.clear = async () => ensureStorage().clear();
  return swr;
}

module.exports = Object.freeze({ SWR_DEFAULTS, createSwr });
