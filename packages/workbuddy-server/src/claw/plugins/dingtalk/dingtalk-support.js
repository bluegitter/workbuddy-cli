'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DINGTALK_API = 'https://api.dingtalk.com';
const DINGTALK_OAPI = 'https://oapi.dingtalk.com';
const MEDIA_CACHE_DIR = path.join(os.tmpdir(), 'dingtalk-media');
const tokenCaches = new Map();
const oapiTokenCaches = new Map();

class TokenCache {
  constructor(fetcher, bufferMs = 60_000) { this.fetcher = fetcher; this.bufferMs = bufferMs; this.cached = null; this.inflight = null; }
  async get() { if (this.cached && Date.now() < this.cached.expiresAt - this.bufferMs) return this.cached.token; this.inflight ||= this.fetch(); try { return await this.inflight; } finally { this.inflight = null; } }
  clear() { this.cached = null; this.inflight = null; }
  async fetch() { const result = await this.fetcher(); this.cached = { token: result.token, expiresAt: Date.now() + result.expiresInSeconds * 1000 }; return result.token; }
}

function detectMediaCategory(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.avi', '.wmv', '.mkv', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.amr', '.m4a', '.opus'].includes(ext)) return 'audio';
  return 'file';
}

async function getAccessToken(appKey, appSecret) {
  if (!tokenCaches.has(appKey)) tokenCaches.set(appKey, new TokenCache(async () => {
    const response = await fetch(`${DINGTALK_API}/v1.0/oauth2/accessToken`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appKey, appSecret }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`DingTalk auth failed: ${response.status}`);
    const data = await response.json(); if (!data.accessToken) throw new Error('DingTalk auth error: no accessToken returned');
    return { token: data.accessToken, expiresInSeconds: data.expireIn || 7200 };
  }));
  return tokenCaches.get(appKey).get();
}

async function getOapiAccessToken(appKey, appSecret) {
  if (!oapiTokenCaches.has(appKey)) oapiTokenCaches.set(appKey, new TokenCache(async () => {
    const response = await fetch(`${DINGTALK_OAPI}/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`);
    if (!response.ok) throw new Error(`DingTalk OAPI auth failed: ${response.status}`);
    const data = await response.json(); if (data.errcode !== 0 || !data.access_token) throw new Error(`DingTalk OAPI auth error: ${data.errmsg || 'no access_token'}`);
    return { token: data.access_token, expiresInSeconds: data.expires_in || 7200 };
  }));
  return oapiTokenCaches.get(appKey).get();
}

async function downloadMediaByCode(downloadCode, appKey, appSecret, logger = console) {
  try {
    const token = await getAccessToken(appKey, appSecret);
    const response = await fetch(`${DINGTALK_API}/v1.0/robot/messageFiles/download`, { method: 'POST', headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ downloadCode, robotCode: appKey }) });
    if (!response.ok) throw new Error(`download code exchange failed: ${response.status}`);
    const result = await response.json(); if (!result.downloadUrl) return null;
    const fileResponse = await fetch(result.downloadUrl, { signal: AbortSignal.timeout(30_000) }); if (!fileResponse.ok) return null;
    const buffer = Buffer.from(await fileResponse.arrayBuffer()); await fs.mkdir(MEDIA_CACHE_DIR, { recursive: true });
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'video/mp4': '.mp4' }[fileResponse.headers.get('content-type') || ''] || '';
    const localPath = path.join(MEDIA_CACHE_DIR, `${crypto.createHash('md5').update(buffer).digest('hex')}${ext}`); await fs.writeFile(localPath, buffer); return localPath;
  } catch (error) { logger.warn?.(`[DingTalkPlugin] downloadMediaByCode error: ${String(error)}`); return null; }
}

function ensureTableBlankLines(text) {
  const lines = String(text || '').split('\n');
  const divider = /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/;
  const row = /^\s*\|?.*\|.*\|?\s*$/;
  return lines.flatMap((line, index) => index && row.test(line) && divider.test(lines[index + 1] || '') && lines[index - 1].trim() && !row.test(lines[index - 1]) ? ['', line] : [line]).join('\n');
}

module.exports = { TokenCache, detectMediaCategory, getAccessToken, getOapiAccessToken, downloadMediaByCode, ensureTableBlankLines, MEDIA_CACHE_DIR };
