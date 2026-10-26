'use strict';

const dns = require('node:dns');
const { promisify } = require('node:util');
const dnsLookupAsync = promisify(dns.lookup);
const DEFAULT_MIN_DELAY_MS = 1500;
const DEFAULT_MAX_WAIT_MS = 30000;
const DEFAULT_PROBE_HOST = 'copilot.tencent.com';
const PROBE_INTERVALS_MS = [500, 1000, 2000, 3000, 5000];
function nextProbeDelay(attempt) { return PROBE_INTERVALS_MS[Math.min(attempt, PROBE_INTERVALS_MS.length - 1)]; }
function sleep(ms, signal) { if (ms <= 0) return Promise.resolve(); return new Promise((resolve) => { if (signal?.aborted) return resolve(); const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms); const onAbort = () => { clearTimeout(timer); resolve(); }; signal?.addEventListener('abort', onAbort, { once: true }); }); }
async function probeOnce(host) { try { await dnsLookupAsync(host); return true; } catch { return false; } }
async function waitForNetworkOnline(options = {}) { const minDelay = Math.max(0, options.minDelay ?? DEFAULT_MIN_DELAY_MS); const maxWait = Math.max(minDelay, options.maxWait ?? DEFAULT_MAX_WAIT_MS); const probeHost = options.probeHost ?? DEFAULT_PROBE_HOST; const { logger, signal } = options; const startedAt = Date.now(); if (signal?.aborted) return { ready: false, waitedMs: 0, aborted: true }; await sleep(minDelay, signal); if (signal?.aborted) return { ready: false, waitedMs: Date.now() - startedAt, aborted: true }; if (await probeOnce(probeHost)) { const waitedMs = Date.now() - startedAt; logger?.info?.(`[waitForNetworkOnline] ready after ${waitedMs}ms (first probe)`); return { ready: true, waitedMs }; } let attempt = 0; while (Date.now() - startedAt < maxWait) { if (signal?.aborted) return { ready: false, waitedMs: Date.now() - startedAt, aborted: true }; await sleep(Math.min(nextProbeDelay(attempt++), maxWait - (Date.now() - startedAt)), signal); if (signal?.aborted) return { ready: false, waitedMs: Date.now() - startedAt, aborted: true }; if (await probeOnce(probeHost)) { const waitedMs = Date.now() - startedAt; logger?.info?.(`[waitForNetworkOnline] ready after ${waitedMs}ms (probe attempt ${attempt})`); return { ready: true, waitedMs }; } } const waitedMs = Date.now() - startedAt; logger?.warn?.(`[waitForNetworkOnline] timed out after ${waitedMs}ms (host=${probeHost}); proceeding anyway`); return { ready: false, waitedMs }; }
module.exports = { DEFAULT_MIN_DELAY_MS, DEFAULT_MAX_WAIT_MS, DEFAULT_PROBE_HOST, PROBE_INTERVALS_MS, nextProbeDelay, sleep, probeOnce, waitForNetworkOnline };
