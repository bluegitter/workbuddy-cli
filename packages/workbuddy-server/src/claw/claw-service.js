'use strict';

const { ClawSettingsStore } = require('./claw-settings-store');
const { readIOAImOverride } = require('./ioa-im-override');

const IOA_ENTERPRISE_IDS = new Set(['esoikz80kd8g', 'etahzsqej0n4']);
const IOA_RESTRICTED_CHANNELS = new Set(['feishu', 'dingtalk', 'slack', 'telegram', 'discord']);
const STALE_AGENT_SESSION_TTL_MS = 1440 * 60 * 1000;

class ClawService {
  static IOA_ENTERPRISE_IDS = IOA_ENTERPRISE_IDS;
  static IOA_RESTRICTED_CHANNELS = IOA_RESTRICTED_CHANNELS;
  static STALE_AGENT_SESSION_TTL_MS = STALE_AGENT_SESSION_TTL_MS;

  constructor(deps = {}) {
    this.logger = deps.logger || console;
    this.productManager = deps.productManager;
    this.authenticationManager = deps.authenticationManager;
    this.detectIOAMachine = deps.detectIOAMachine || (async () => false);
    this.store = deps.store || new ClawSettingsStore(() => this.authenticationManager?.currentSessionSubject?.getValue()?.account?.uid, deps.settingsPath);
    this.runtime = deps.runtime;
    this.ioaMachineDetected = undefined;
    this.activeConversations = new Map();
    this.staleAgentSessionIds = new Map();
  }

  isIOAUser() { const enterpriseId = this.authenticationManager?.currentSessionSubject?.getValue()?.account?.enterpriseId; return Boolean(enterpriseId && IOA_ENTERPRISE_IDS.has(enterpriseId)); }
  isIOAMachinePersonalAccount() { return this.ioaMachineDetected === true && !this.isIOAUser(); }
  async initIOAMachineDetection() { if (this.ioaMachineDetected !== undefined) return; try { this.ioaMachineDetected = Boolean(await this.detectIOAMachine()); } catch { this.ioaMachineDetected = false; } }
  getIsIOAMachine() { return Boolean(this.ioaMachineDetected); }
  isQQChannelRestricted() { return false; }
  isChannelRestricted(channelType) {
    if (this.isIOAUser() || this.isIOAMachinePersonalAccount()) {
      if (!IOA_RESTRICTED_CHANNELS.has(channelType)) return false;
      return this.isIOAUser() ? !((this.productManager?.getCurrentConfiguration?.()?.productFeatures?.IOAImWhitelistEligible === true) && readIOAImOverride()) : true;
    }
    return channelType === 'wecomIOA';
  }
  getChannelStatus() { const status = this.store.deriveStatusMap(); for (const type of Object.keys(status)) if (this.isChannelRestricted(type)) delete status[type]; return status; }
  getSavedChannelConfigs() { return this.store.getChannelConfigs(); }
  getSavedChannels() { return this.store.listSavedChannels().filter((type) => !this.isChannelRestricted(type)); }
  getWecomEnabled() { return this.store.getWecomEnabled(); }
  setWecomEnabled(enabled) { this.store.setWecomEnabled(enabled); return Boolean(enabled); }
  getWechatmpEnabled() { const config = this.store.getChannelConfigs().wechatmp; return config ? this.store.isChannelEnabled('wechatmp') : true; }
  enableWechatmpChannel() { this.store.setChannelConfig('wechatmp', { ...this.store.getChannelConfigs().wechatmp, enabled: true }); }
  disableWechatmpChannel() { this.store.setChannelConfig('wechatmp', { ...this.store.getChannelConfigs().wechatmp, enabled: false }); }
  getRuntime() { return this.runtime || { getStatusMap: (map) => map, removePersistedChannel: () => {} }; }
  async startSavedChannels() { return this.runtime?.startSavedChannels?.() || []; }
  async stopAllChannels() { return this.runtime?.stopAllChannels?.(); }
  async startChannelPlugin(type) { if (this.isChannelRestricted(type)) return { action: 'restricted' }; return this.runtime?.startChannelPlugin?.(type); }
  async stopChannelPlugin(type) { return this.runtime?.stopChannelPlugin?.(type); }
  clearActiveConversations() { this.activeConversations.clear(); }
  formatLog(message, fields) { return fields ? `${message} ${JSON.stringify(fields)}` : message; }
}

module.exports = Object.freeze({ ClawService, IOA_ENTERPRISE_IDS, IOA_RESTRICTED_CHANNELS, STALE_AGENT_SESSION_TTL_MS });
