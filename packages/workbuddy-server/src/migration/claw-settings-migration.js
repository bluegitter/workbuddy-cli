'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function legacyAppDataDir() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
}
function getLegacySettingsPath() { return path.join(legacyAppDataDir(), 'WorkBuddy', 'User', 'settings.json'); }
function getWorkbuddyConfigDir() { return process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'); }
function getTargetSettingsPath() { return path.join(getWorkbuddyConfigDir(), 'settings.json'); }

class ClawSettingsMigrationService {
  migrate(sourcePath = getLegacySettingsPath(), targetPath = getTargetSettingsPath()) {
    const result = { sourcePath, targetPath, skipped: false, channelsMigrated: 0, channelNames: [] };
    if (!fs.existsSync(sourcePath)) return { ...result, skipped: true, reason: 'legacy_settings_not_found' };
    let legacy;
    try { legacy = JSON.parse(fs.readFileSync(sourcePath, 'utf8')); } catch (error) { return { ...result, skipped: true, reason: `legacy_settings_parse_error: ${error instanceof Error ? error.message : String(error)}` }; }

    const merged = {};
    const wecomChannels = legacy['wecom.channels'];
    if (wecomChannels && typeof wecomChannels === 'object') for (const [type, config] of Object.entries(wecomChannels)) if (config && typeof config === 'object') merged[this.normalizeLegacyChannelType(type)] = this.normalizeWecomChannel(config);
    this.applyLegacyWecomAiBotSettings(legacy, merged);
    this.applyLegacyWecomEnabled(legacy, merged);
    const clawChannels = legacy['claw.channels'];
    if (clawChannels && typeof clawChannels === 'object') for (const [type, config] of Object.entries(clawChannels)) if (config && typeof config === 'object') merged[this.normalizeLegacyChannelType(type)] = { ...merged[this.normalizeLegacyChannelType(type)], ...config };
    if (!Object.keys(merged).length) return { ...result, skipped: true, reason: 'no_channel_configs_found' };

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    let existing = {};
    if (fs.existsSync(targetPath)) try { existing = JSON.parse(fs.readFileSync(targetPath, 'utf8')); } catch { existing = {}; }
    const existingChannels = existing.claw?.channels && typeof existing.claw.channels === 'object' ? existing.claw.channels : {};
    const finalChannels = { ...existingChannels };
    for (const [type, config] of Object.entries(merged)) if (!(type in finalChannels)) finalChannels[type] = config;
    existing.claw = { ...(existing.claw && typeof existing.claw === 'object' ? existing.claw : {}), channels: finalChannels };
    fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2), 'utf8');
    const channelNames = Object.keys(merged).filter((type) => !(type in existingChannels));
    return { ...result, channelsMigrated: channelNames.length, channelNames };
  }

  normalizeWecomChannel(raw) {
    const { extra, response, ...rest } = raw;
    const normalizedExtra = extra && typeof extra === 'object' ? extra : {};
    const normalizedResponse = response && typeof response === 'object' ? response : undefined;
    const registration = normalizedResponse ? { webhookUrl: typeof normalizedResponse.webhookUrl === 'string' ? normalizedResponse.webhookUrl : undefined, sessionId: typeof normalizedResponse.sessionId === 'string' ? normalizedResponse.sessionId : undefined } : undefined;
    const channelId = typeof raw.channelId === 'string' ? raw.channelId : typeof normalizedResponse?.channelId === 'string' ? normalizedResponse.channelId : undefined;
    const config = { enabled: true, ...rest, channelId, ...normalizedExtra };
    if (registration?.webhookUrl || registration?.sessionId) config.registration = registration;
    if (typeof config.connectionMode !== 'string' || !config.connectionMode) config.connectionMode = 'webhook';
    return config;
  }

  applyLegacyWecomAiBotSettings(settings, channels) {
    const botId = typeof settings['wecom.botId'] === 'string' ? settings['wecom.botId'] : undefined;
    if (!botId) return;
    const existing = channels.wecomaibot || {};
    channels.wecomaibot = { ...existing, enabled: existing.enabled ?? true, channelId: existing.channelId || botId, botId: existing.botId || botId, botSecret: typeof existing.botSecret === 'string' ? existing.botSecret : settings['wecom.botSecret'] || '', connectionMode: existing.connectionMode || settings['wecom.connectionMode'] || 'websocket' };
  }
  applyLegacyWecomEnabled(settings, channels) { if (typeof settings['wecom.enabled'] === 'boolean') channels.wecomIOA = { ...(channels.wecomIOA || {}), enabled: channels.wecomIOA?.enabled ?? settings['wecom.enabled'] }; }
  normalizeLegacyChannelType(type) { return type === 'weixinBot' ? 'weixinClawBot' : type; }
}

module.exports = { ClawSettingsMigrationService, getLegacySettingsPath, getTargetSettingsPath, getWorkbuddyConfigDir, legacyAppDataDir };
