'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const { QQBindService } = require('./qq-bind-service');
const { WechatBotApiClient } = require('./wechatbot-api-client');

const DEFAULT_BACKEND_MODE = 'local';
const DEFAULT_CHANNEL_TYPE = 'wechatbot';
const LOCAL_AGENT_TYPE = 'claudecode';

class AgentImService {
  constructor(deps = {}) {
    this.logger = deps.logger || console; this.authenticationManager = deps.authenticationManager; this.clawService = deps.clawService; this.store = deps.store; this.pushClawSnapshot = undefined;
    this.wechatBotClient = deps.wechatBotClient || new WechatBotApiClient(this.logger, deps.productManager, deps.authenticationManager, deps.fetch || globalThis.fetch);
    this.qqBindService = new QQBindService({ logger: this.logger, store: this.store, requireUserId: () => this.requireUserId(), normalizeTarget: (value) => this.normalizeTarget(value), buildSessionId: (...args) => this.buildSessionId(...args), buildBindingId: (...args) => this.buildBindingId(...args), registerClawChannel: async (...args) => this.registerQqClawChannel(...args), unregisterClawChannel: async () => this.unregisterQqClawChannel(), isQQChannelRestricted: deps.isQQChannelRestricted });
  }
  setQQEventEmitter(emitter) { this.qqBindService.setEventEmitter(emitter); }
  setPushClawSnapshot(push) { this.pushClawSnapshot = push; }
  listBindings(params = {}) { return { bindings: this.store.listBindings(this.requireUserId(), params) }; }
  getBinding(params) { const userId = this.requireUserId(); return { binding: this.store.getBinding(userId, this.normalizeSelector(params)) }; }
  wechatBotPrebindCheck(params) { this.requireUserId(); this.normalizeTarget(params); const conflict = this.clawService.getWeixinClawBotConflict(); return { conflict, requiresDisableLocalClaw: Boolean(conflict.exists && conflict.enabled) }; }
  async wechatBotStartBind(params) { const userId = this.requireUserId(); const target = this.normalizeTarget(params); const backendMode = params.backendMode || DEFAULT_BACKEND_MODE; const conflict = this.clawService.getWeixinClawBotConflict(); if (conflict.exists && conflict.enabled && !params.confirmDisableLocalClaw) return { success: false, requiresDisableLocalClaw: true, conflict, message: '微信 bot 目前是 1 对 1 链接，绑定会禁用本地 Claw 微信 bot 链接。' }; if (conflict.exists && conflict.enabled) await this.clawService.disableWeixinClawBotForAgentIm(); const sessionId = this.buildSessionId(userId, target, backendMode, DEFAULT_CHANNEL_TYPE); const link = await this.wechatBotClient.link({ sessionId, userId, localAgentType: LOCAL_AGENT_TYPE }); const now = Date.now(); const previous = this.store.getBinding(userId, { ...target, backendMode, channelType: DEFAULT_CHANNEL_TYPE }); const binding = this.store.upsertBinding({ ...previous, bindingId: previous?.bindingId || this.buildBindingId(userId, target, backendMode, DEFAULT_CHANNEL_TYPE), userId, ...target, backendMode, channelType: DEFAULT_CHANNEL_TYPE, sessionId, enabled: true, status: 'binding', token: link.token, expiresAt: now + link.expiresIn * 1000, createdAt: previous?.createdAt || now, updatedAt: now }); return { success: true, binding, qrcodeImgContent: link.qrcodeImgContent, token: link.token, expiresIn: link.expiresIn }; }
  async wechatBotGetBindStatus(params) { const userId = this.requireUserId(); const target = this.normalizeTarget(params); const backendMode = params.backendMode || DEFAULT_BACKEND_MODE; const binding = this.store.getBinding(userId, { ...target, backendMode, channelType: DEFAULT_CHANNEL_TYPE }); if (!binding) return { success: false, bound: false, message: 'WechatBot binding not found' }; const status = await this.wechatBotClient.bindStatus({ sessionId: binding.sessionId, userId, localAgentType: LOCAL_AGENT_TYPE }); if (!status.bound) return { success: true, bound: false, binding }; const saved = this.store.upsertBinding({ ...binding, enabled: true, status: 'bound', instanceId: status.instanceId, displayName: status.displayName, accountId: status.accountId, token: undefined, expiresAt: undefined, updatedAt: Date.now() }); return { success: true, bound: true, binding: saved, instanceId: status.instanceId, displayName: status.displayName, accountId: status.accountId }; }
  async wechatBotUnbind(params) { const userId = this.requireUserId(); const target = this.normalizeTarget(params); const backendMode = params.backendMode || DEFAULT_BACKEND_MODE; const binding = this.store.getBinding(userId, { ...target, backendMode, channelType: DEFAULT_CHANNEL_TYPE }); if (!binding) return { success: false, message: 'WechatBot binding not found' }; const result = await this.wechatBotClient.unbind(binding.sessionId); return { success: true, binding: this.store.upsertBinding({ ...binding, enabled: false, status: 'unbound', token: undefined, expiresAt: undefined, updatedAt: Date.now() }), instanceId: result.instanceId, status: result.status }; }
  qqStartBind(params) { return this.qqBindService.startBind(params); }
  qqCancelBind(params) { return this.qqBindService.cancelBind(params); }
  qqGetBindStatus(params) { return this.qqBindService.getBindStatus(params); }
  qqManualBind(params) { return this.qqBindService.manualBind(params); }
  qqUnbind(params) { return this.qqBindService.unbind(params); }
  requireUserId() { const userId = this.authenticationManager?.currentSessionSubject?.getValue?.()?.account?.uid; if (!userId) throw new Error('User not logged in'); return userId; }
  normalizeSelector(params = {}) { return { ...this.normalizeTarget(params), backendMode: params.backendMode || DEFAULT_BACKEND_MODE, channelType: params.channelType || DEFAULT_CHANNEL_TYPE }; }
  normalizeTarget(params = {}) { const targetId = params.targetId?.trim(); if (!targetId) throw new Error('targetId is required'); if (!['assistant', 'colleague'].includes(params.targetType)) throw new Error('targetType must be assistant or colleague'); return { targetType: params.targetType, targetId }; }
  buildSessionId(userId, target, backendMode, channelType) { const workspaceHash = crypto.createHash('sha256').update(['agent-im', target.targetType, target.targetId, backendMode, channelType].join(':')).digest('hex').slice(0, 16); return `${userId}_${this.getStableHostId()}_${workspaceHash}`; }
  buildBindingId(userId, target, backendMode, channelType) { return crypto.createHash('sha256').update([userId, target.targetType, target.targetId, backendMode, channelType].join(':')).digest('hex').slice(0, 32); }
  getStableHostId() { if (!this.stableHostId) this.stableHostId = crypto.createHash('sha256').update(`${os.hostname()}_${os.homedir()}_${process.platform}_${process.arch}`).digest('hex').slice(0, 32); return this.stableHostId; }
  async registerQqClawChannel(appId, appSecret, isCancelled) { if (!this.clawService.registerChannelConfig || !this.clawService.startChannelPlugin) return { success: false, error: 'Claw channel service unavailable' }; try { await this.clawService.registerChannelConfig({ channelType: 'qq', channelId: appId, extra: { connectionMode: 'scan', appId, appSecret } }); await Promise.race([this.clawService.startChannelPlugin('qq'), new Promise((_, reject) => setTimeout(() => reject(new Error('QQ plugin start timeout')), 30000))]); this.pushClawSnapshot?.(); return { success: true }; } catch (error) { if (isCancelled?.()) return { success: false, error: error.message }; if (/auth|invalid.*bot|secret/i.test(error.message || '')) this.clawService.unregisterChannelConfig?.('qq'); await this.clawService.stopChannelPlugin?.('qq'); this.pushClawSnapshot?.(); return { success: false, error: error.message || String(error) }; } }
  async unregisterQqClawChannel() { await this.clawService.forceDisconnectChannel?.('qq'); this.clawService.unregisterChannelConfig?.('qq'); await this.clawService.stopChannelPlugin?.('qq'); this.pushClawSnapshot?.(); }
}
module.exports = { AgentImService, DEFAULT_BACKEND_MODE, DEFAULT_CHANNEL_TYPE, LOCAL_AGENT_TYPE };
