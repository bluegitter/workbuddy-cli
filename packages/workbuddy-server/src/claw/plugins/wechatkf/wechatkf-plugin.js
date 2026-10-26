'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { getWorkbuddyRuntimeAppName } = require('../../../../../runtime/src/runtime/runtime-context');
const { PassiveGatewayAdapter } = require('../../core/plugin-types');

const TEMP_DIR = path.join(os.homedir(), getWorkbuddyRuntimeAppName(), 'Claw', 'attachments', 'wechatkf');
async function download(url, name, mimeType, logger = console) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const buffer = Buffer.from(await response.arrayBuffer()); const directory = path.join(TEMP_DIR, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`); await fs.promises.mkdir(directory, { recursive: true }); const safeName = String(name || `wechatkf-file-${Date.now()}`).replace(/[\\/\x00-\x1f]/g, '_').slice(0, 128); const filePath = path.join(directory, safeName); await fs.promises.writeFile(filePath, buffer); return { filePath, mimeType: mimeType || response.headers.get('content-type') || 'application/octet-stream', ...(buffer.length <= 5 * 1024 * 1024 && (mimeType || '').startsWith('image/') ? { base64: buffer.toString('base64') } : {}) }; } catch (error) { logger.warn?.('[WechatkfPlugin] media download failed', error); return null; }
}
class WechatkfGatewayAdapter extends PassiveGatewayAdapter {
  constructor(logger = console) { super(); this.logger = logger; }
  pushInboundMessage(message) { const items = message.content || []; Promise.all(items.map((item) => item.uri?.match(/^https?:\/\//) ? download(item.uri, item.name, item.mimeType, this.logger) : null)).then((results) => this.onInboundMessage?.({ ...message, content: items.map((item, index) => { const result = results[index]; return result ? { ...item, uri: pathToFileURL(result.filePath).href, name: path.basename(result.filePath), mimeType: result.mimeType, ...(result.base64 ? { data: result.base64 } : {}) } : item; }) })).catch(() => this.onInboundMessage?.(message)); }
}
class WechatkfConfigAdapter { resolveAccount(raw = {}) { const webhookUrl = raw.webhookUrl || ''; return { accountId: webhookUrl ? `wechatkf-${webhookUrl.slice(-8)}` : 'wechatkf-passive', displayName: 'WeChat KF Bot', credential: { webhookUrl, corpId: raw.corpId, kfId: raw.kfId } }; } }
class WechatkfOutboundAdapter { constructor(logger = console) { this.logger = logger; } async send(message) { if (message.deliveryMode !== 'final') return { success: true }; const url = message.replyContext?.webhookUrl; if (!url) return { success: false, error: 'Missing webhookUrl in replyContext' }; try { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ touser: message.replyContext.userId, msgtype: 'text', text: { content: message.text } }) }); return response.ok ? { success: true } : { success: false, error: `WeChat KF API error: ${response.status}` }; } catch (error) { return { success: false, error: error.message || String(error) }; } } }
function createWechatkfPlugin(deps = {}) { const gateway = new WechatkfGatewayAdapter(deps.logger); return { id: 'wechatkf', meta: { displayName: 'WeChat KF Bot', transport: 'webhook' }, capabilities: { sendText: true, sendMarkdown: false, sendMedia: false, interactive: false, streaming: false, groupChat: false, threading: false }, config: new WechatkfConfigAdapter(), gateway, outbound: new WechatkfOutboundAdapter(deps.logger), defaultReplyPolicy: { mode: 'all' } }; }
module.exports = { WechatkfConfigAdapter, WechatkfGatewayAdapter, WechatkfOutboundAdapter, createWechatkfPlugin, downloadMediaToLocal: download };
