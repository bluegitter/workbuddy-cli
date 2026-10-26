'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { getWorkbuddyRuntimeAppName } = require('../../../../../runtime/src/runtime/runtime-context');
const { PassiveGatewayAdapter } = require('../../core/plugin-types');

const TEMP_DIR = path.join(os.homedir(), getWorkbuddyRuntimeAppName(), 'Claw', 'attachments');
const ALLOWED_HOST_SUFFIXES = ['.myqcloud.com'];
const DOWNLOAD_TIMEOUT_MS = 30_000;
const INLINE_BASE64_MAX_BYTES = 5 * 1024 * 1024;

class WechatmpConfigAdapter {
  resolveAccount(raw = {}) { const webhookUrl = raw.webhookUrl || ''; return { accountId: webhookUrl ? `wechatmp-${webhookUrl.slice(-8)}` : 'wechatmp-passive', displayName: 'WeChat MP Bot', credential: { webhookUrl, appId: raw.appId, appSecret: raw.appSecret } }; }
}
function isAllowedMediaUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.toLowerCase().endsWith(suffix)); } catch { return false; } }
function inferExtFromContentType(value) { return { 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' }[value.split(';')[0].trim().toLowerCase()] || '.jpg'; }
async function downloadImageToLocal(url, logger = console) {
  if (!isAllowedMediaUrl(url)) return null;
  try { const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: 'error' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const buffer = Buffer.from(await response.arrayBuffer()); const type = response.headers.get('content-type') || ''; const filePath = path.join(TEMP_DIR, `wechatmp-img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${inferExtFromContentType(type)}`); await fs.promises.mkdir(TEMP_DIR, { recursive: true }); await fs.promises.writeFile(filePath, buffer); return { filePath, ...(buffer.length <= INLINE_BASE64_MAX_BYTES ? { base64: buffer.toString('base64'), mimeType: type.split(';')[0] || undefined } : {}) }; } catch (error) { logger.warn?.('[WechatmpPlugin] image download failed', error); return null; }
}
function sanitizeInboundFilename(raw, mimeType) { const fallback = { 'application/pdf': '.pdf', 'application/json': '.json', 'text/plain': '.txt', 'text/markdown': '.md' }[mimeType?.split(';')[0]] || ''; const cleaned = String(raw || '').split(/[\\/]/).pop().split(/[?#]/)[0].replace(/[\x00-\x1f]/g, '_'); const dot = cleaned.lastIndexOf('.'); let base = dot > 0 ? cleaned.slice(0, dot) : cleaned || 'wechatmp-file'; let ext = dot > 0 ? cleaned.slice(dot) : fallback; return { base: base.slice(0, 100), ext }; }
async function downloadFileToLocal(url, originalName, mimeType, logger = console) {
  if (!isAllowedMediaUrl(url)) return null;
  try { const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: 'error' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const buffer = Buffer.from(await response.arrayBuffer()); const finalMime = mimeType || response.headers.get('content-type') || 'application/octet-stream'; const name = sanitizeInboundFilename(originalName, finalMime); const dir = path.join(TEMP_DIR, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`); await fs.promises.mkdir(dir, { recursive: true }); const filePath = path.join(dir, `${name.base}${name.ext}`); await fs.promises.writeFile(filePath, buffer); return { filePath, mimeType: finalMime }; } catch (error) { logger.warn?.('[WechatmpPlugin] file download failed', error); return null; }
}

class WechatmpGatewayAdapter extends PassiveGatewayAdapter {
  constructor(logger = console) { super(); this.logger = logger; }
  pushInboundMessage(message) {
    const tasks = (message.content || []).map((item, index) => item.uri?.match(/^https?:\/\//) ? { item, index, kind: item.type } : null).filter(Boolean);
    if (!tasks.length) return super.pushInboundMessage(message);
    Promise.all(tasks.map((task) => task.kind === 'image' ? downloadImageToLocal(task.item.uri, this.logger) : downloadFileToLocal(task.item.uri, task.item.name, task.item.mimeType, this.logger))).then((results) => this.onInboundMessage?.({ ...message, content: message.content.map((item, index) => { const result = results[tasks.findIndex((task) => task.index === index)]; return result ? { ...item, uri: pathToFileURL(result.filePath).href, name: path.basename(result.filePath), ...(result.mimeType ? { mimeType: result.mimeType } : {}), ...(result.base64 ? { data: result.base64 } : {}) } : item; }) })).catch(() => this.onInboundMessage?.(message));
  }
}
class WechatmpOutboundAdapter {
  constructor(logger = console) { this.logger = logger; }
  async send(message) { if (message.deliveryMode !== 'final') return { success: true }; const url = message.replyContext?.webhookUrl; const userId = message.replyContext?.userId; if (!url || !userId) return { success: false, error: 'Missing webhookUrl or userId in replyContext' }; try { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ touser: userId, msgtype: 'text', text: { content: message.text } }) }); return response.ok ? { success: true } : { success: false, error: `WeChat MP API error: ${response.status}` }; } catch (error) { return { success: false, error: error.message || String(error) }; } }
}

function createWechatmpPlugin(deps = {}) { const gateway = new WechatmpGatewayAdapter(deps.logger); return { id: 'wechatmp', meta: { displayName: 'WeChat MP Bot', transport: 'webhook' }, capabilities: { sendText: true, sendMarkdown: true, sendMedia: false, interactive: false, streaming: false, groupChat: false, threading: false }, config: new WechatmpConfigAdapter(), gateway, outbound: new WechatmpOutboundAdapter(deps.logger), defaultReplyPolicy: { mode: 'all' } }; }
module.exports = { WechatmpConfigAdapter, WechatmpGatewayAdapter, WechatmpOutboundAdapter, createWechatmpPlugin, isAllowedMediaUrl, sanitizeInboundFilename, downloadImageToLocal, downloadFileToLocal };
