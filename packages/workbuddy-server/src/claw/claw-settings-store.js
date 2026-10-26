'use strict';
const fs = require('node:fs'); const path = require('node:path');
const { CLAW_CHANNEL_TYPES, isClawChannelType } = require('./claw-types');
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
class ClawSettingsStore {
  constructor(currentUserIdProvider, settingsPath) { this.currentUserIdProvider = currentUserIdProvider; this.settingsPath = settingsPath || path.join(process.env.WORKBUDDY_CONFIG_DIR || process.cwd(), 'settings.json'); }
  getSettingsPath() { return this.settingsPath; }
  readSettingsFile() { try { const value = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')); return isObject(value) ? value : {}; } catch { return {}; } }
  writeSettingsFile(value) { fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true }); const tmp = `${this.settingsPath}.tmp-${process.pid}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, this.settingsPath); }
  getChannelConfigs() { const file = this.readSettingsFile(); const claw = isObject(file.claw) ? file.claw : {}; const uid = this.currentUserIdProvider?.(); const scoped = isObject(claw.users?.[uid]?.channels) ? claw.users[uid].channels : {}; const legacy = isObject(claw.channels) && (!claw.legacyOwnerUid || claw.legacyOwnerUid === uid) ? claw.channels : {}; return { ...legacy, ...scoped }; }
  getClawSettings() { return { ...this.readSettingsFile().claw, channels: this.getChannelConfigs() }; }
  isChannelEnabled(type) { const config = this.getChannelConfigs()[type]; return isObject(config) && config.enabled !== false; }
  listSavedChannels() { return Object.keys(this.getChannelConfigs()).filter(isClawChannelType); }
  deriveStatusMap() { return Object.fromEntries(this.listSavedChannels().map((type) => [type, this.isChannelEnabled(type) ? 'configured' : 'disabled'])); }
  setChannelConfig(type, config) { const file = this.readSettingsFile(); const claw = isObject(file.claw) ? file.claw : {}; const uid = this.currentUserIdProvider?.(); const users = { ...(claw.users || {}) }; if (uid) users[uid] = { ...(users[uid] || {}), channels: { ...(users[uid]?.channels || {}), [type]: { ...(this.getChannelConfigs()[type] || {}), ...config } } }; else claw.channels = { ...(claw.channels || {}), [type]: { ...(this.getChannelConfigs()[type] || {}), ...config } }; file.claw = { ...claw, users }; this.writeSettingsFile(file); }
  removeChannelConfig(type) { const file = this.readSettingsFile(); const claw = isObject(file.claw) ? file.claw : {}; const uid = this.currentUserIdProvider?.(); if (uid && claw.users?.[uid]?.channels) { const channels = { ...claw.users[uid].channels }; delete channels[type]; file.claw = { ...claw, users: { ...claw.users, [uid]: { ...claw.users[uid], channels } } }; } else if (claw.channels) { const channels = { ...claw.channels }; delete channels[type]; file.claw = { ...claw, channels }; } this.writeSettingsFile(file); }
  getWecomEnabled() { return this.readSettingsFile()['wecom.enabled'] ?? this.isChannelEnabled('wecomIOA'); }
  setWecomEnabled(enabled) { const file = this.readSettingsFile(); file['wecom.enabled'] = Boolean(enabled); this.writeSettingsFile(file); this.setChannelConfig('wecomIOA', { enabled: Boolean(enabled) }); }
}
module.exports = Object.freeze({ CLAW_CHANNEL_TYPES, isObject, ClawSettingsStore });
