'use strict';

const WebSocket = require('ws');
const { DiscordOpcode, DISCORD_INTENTS, DISCORD_CLOSE_CODE, DEFAULT_MAX_RECONNECT_DELAY_MS } = require('./discord-types');

const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
function isAllowedDiscordGatewayUrl(raw) { try { const url = new URL(raw); return url.protocol === 'wss:' && url.hostname.toLowerCase().endsWith('.discord.gg') && (!url.port || url.port === '443') && !url.username && !url.password && !url.hash && url.pathname === '/'; } catch { return false; } }

class DiscordClient {
  constructor(logger = console, userAgent = 'WorkBuddy') { this.logger = logger; this.userAgent = userAgent; this.status = { status: 'disconnected' }; this.statusListeners = []; this.messageListeners = []; this.recentMessageIds = new Set(); this.recentMessageQueue = []; this.reconnectAttempts = 0; this.heartbeatAcked = true; }
  onStatusChange(listener) { this.statusListeners.push(listener); }
  onMessage(listener) { this.messageListeners.push(listener); }
  getStatus() { return this.status; }
  async connect(credentials, options = {}) { if (this.disposed) return; this.updateStatus({ status: 'connecting' }); try { await this.openWebSocket(this.resumeGatewayUrl || GATEWAY, credentials); } catch (error) { this.updateStatus({ status: 'error', error: error.message, errorCode: 'NETWORK' }); if (options.throwOnError) throw error; } }
  openWebSocket(url, credentials) { return new Promise((resolve, reject) => { if (!isAllowedDiscordGatewayUrl(url)) return reject(new Error('Invalid Discord gateway URL')); this.cleanupWs(); const ws = this.ws = new WebSocket(url, { headers: { 'User-Agent': this.userAgent } }); let settled = false; ws.on('open', () => this.logger.info?.('[DiscordClient] WebSocket connected')); ws.on('message', (data) => { try { this.handlePayload(JSON.parse(data.toString()), credentials, () => { if (!settled) { settled = true; resolve(); } }); } catch (error) { this.logger.error?.('[DiscordClient] Failed to parse message', error); } }); ws.on('close', (code) => { this.stopHeartbeat(); this.handleClose(code, credentials); if (!settled) { settled = true; reject(new Error(`WebSocket closed: ${code}`)); } }); ws.on('error', (error) => { if (!settled) { settled = true; reject(error); } }); setTimeout(() => { if (!settled) { settled = true; reject(new Error('Connection timeout')); } }, 30_000); }); }
  handlePayload(payload, credentials, onReady) { if (payload.s != null) this.seq = payload.s; switch (payload.op) { case DiscordOpcode.HELLO: this.startHeartbeat(payload.d.heartbeat_interval); this.sessionId && this.seq != null ? this.sendResume(credentials) : this.sendIdentify(credentials); break; case DiscordOpcode.HEARTBEAT_ACK: this.heartbeatAcked = true; break; case DiscordOpcode.HEARTBEAT: this.sendHeartbeat(); break; case DiscordOpcode.RECONNECT: this.ws?.close(4000); break; case DiscordOpcode.INVALID_SESSION: if (!payload.d) { this.sessionId = null; this.seq = null; } break; case DiscordOpcode.DISPATCH: this.handleDispatch(payload.t, payload.d, onReady); break; } }
  handleDispatch(event, data, onReady) { if (event === 'READY') { this.sessionId = data.session_id; this.resumeGatewayUrl = data.resume_gateway_url; this.botUserId = data.user.id; this.reconnectAttempts = 0; this.updateStatus({ status: 'connected', connectedAt: Date.now() }); onReady(); } else if (event === 'RESUMED') { this.reconnectAttempts = 0; this.updateStatus({ status: 'connected', connectedAt: Date.now() }); onReady(); } else if (event === 'MESSAGE_CREATE' && data.author?.id !== this.botUserId && !data.author?.bot && !this.recentMessageIds.has(data.id)) { this.trackMessageId(data.id); this.messageListeners.forEach((listener) => listener(data)); } }
  handleClose(code, credentials) { if ([DISCORD_CLOSE_CODE.AUTHENTICATION_FAILED, DISCORD_CLOSE_CODE.INVALID_INTENTS, DISCORD_CLOSE_CODE.DISALLOWED_INTENTS].includes(code)) return this.updateStatus({ status: 'error', error: 'Discord authentication or intents failed', errorCode: 'AUTH_FAILED', nonRecoverable: true }); if (!this.disposed) this.scheduleReconnect(credentials); }
  scheduleReconnect(credentials) { if (this.reconnectTimer || this.reconnectAttempts >= 5) return; const delay = Math.min(1000 * 2 ** this.reconnectAttempts++, DEFAULT_MAX_RECONNECT_DELAY_MS); this.updateStatus({ status: 'connecting' }); this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(credentials).catch(() => {}); }, delay); }
  sendIdentify(credentials) { this.send({ op: DiscordOpcode.IDENTIFY, d: { token: credentials.token, intents: DISCORD_INTENTS.GUILDS | DISCORD_INTENTS.GUILD_MESSAGES | DISCORD_INTENTS.DIRECT_MESSAGES | DISCORD_INTENTS.MESSAGE_CONTENT, properties: { os: process.platform, browser: 'WorkBuddy', device: 'WorkBuddy' } } }); }
  sendResume(credentials) { this.send({ op: DiscordOpcode.RESUME, d: { token: credentials.token, session_id: this.sessionId, seq: this.seq } }); }
  startHeartbeat(interval) { this.stopHeartbeat(); this.heartbeatAcked = true; this.heartbeatTimer = setInterval(() => { if (!this.heartbeatAcked) return this.ws?.close(4000); this.heartbeatAcked = false; this.sendHeartbeat(); }, interval); this.heartbeatTimer.unref?.(); }
  stopHeartbeat() { if (this.heartbeatTimer) clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  sendHeartbeat() { this.send({ op: DiscordOpcode.HEARTBEAT, d: this.seq }); }
  send(payload) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload)); }
  cleanupWs() { if (this.ws) { this.ws.removeAllListeners(); this.ws.close(); this.ws = null; } }
  trackMessageId(id) { this.recentMessageIds.add(id); this.recentMessageQueue.push(id); if (this.recentMessageQueue.length > 200) this.recentMessageIds.delete(this.recentMessageQueue.shift()); }
  updateStatus(status) { this.status = status; this.statusListeners.forEach((listener) => listener(status)); }
  closeKeepingSession() { this.stopHeartbeat(); if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer = null; this.cleanupWs(); this.updateStatus({ status: 'disconnected' }); }
  dispose() { this.disposed = true; this.stopHeartbeat(); if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.cleanupWs(); this.statusListeners = []; this.messageListeners = []; }
}

module.exports = { DiscordClient, isAllowedDiscordGatewayUrl };
