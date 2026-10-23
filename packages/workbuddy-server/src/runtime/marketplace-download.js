'use strict';

const http = require('node:http');
const https = require('node:https');
const { normalizeEtag } = require('./marketplace-cache');

const MAX_REDIRECTS = 5;
const DEFAULT_HEAD_TIMEOUT_MS = 5000;

function downloadBufferWithHeaders(url, { redirects = 0, request = requestForUrl, maxRedirects = MAX_REDIRECTS } = {}) {
  return new Promise((resolve, reject) => {
    request(url, { method: 'GET' }, (response) => {
      if (isRedirect(response) && redirects < maxRedirects) return downloadBufferWithHeaders(response.headers.location, { redirects: redirects + 1, request, maxRedirects }).then(resolve, reject);
      if (response.statusCode !== 200) { response.resume?.(); reject(new Error(`Download failed with status ${response.statusCode}`)); return; }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({ buffer: Buffer.concat(chunks), etag: normalizeEtag(response.headers.etag) }));
      response.on('error', reject);
    }).on('error', reject);
  });
}

function fetchRemoteEtag(url, { redirects = 0, request = requestForUrl, timeoutMs = DEFAULT_HEAD_TIMEOUT_MS, maxRedirects = MAX_REDIRECTS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    try {
      const req = request(url, { method: 'HEAD' }, (response) => {
        if (isRedirect(response) && redirects < maxRedirects) {
          response.resume?.();
          fetchRemoteEtag(response.headers.location, { redirects: redirects + 1, request, timeoutMs, maxRedirects }).then(finish);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) { response.resume?.(); finish(null); return; }
        response.resume?.(); finish(normalizeEtag(response.headers.etag));
      });
      req.setTimeout?.(timeoutMs, () => { req.destroy?.(); finish(null); });
      req.on('error', () => finish(null));
      req.end?.();
    } catch { finish(null); }
  });
}

function requestForUrl(url, options, callback) {
  const client = String(url).startsWith('https:') ? https : http;
  return client.request(url, options, callback);
}

function isRedirect(response) { return response.statusCode >= 300 && response.statusCode < 400 && typeof response.headers?.location === 'string'; }

module.exports = { DEFAULT_HEAD_TIMEOUT_MS, MAX_REDIRECTS, downloadBufferWithHeaders, fetchRemoteEtag, isRedirect };
