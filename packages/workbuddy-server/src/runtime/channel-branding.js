'use strict';

const path = require('path');

function normalizeString(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function parseChannelBrandingConfig(raw) {
  if (!isRecord(raw) || !isRecord(raw.channels)) return undefined;
  return { channelId: normalizeString(raw.channelId), envKey: normalizeString(raw.envKey), channels: raw.channels };
}
function toSafeAssetSegments(assetPath) {
  const value = normalizeString(assetPath);
  if (!value || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\')) return undefined;
  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.length && !segments.some((segment) => segment === '.' || segment === '..') ? segments : undefined;
}
function toLocalFileUrl(filePath, platform = process.platform) {
  return platform === 'win32' ? `local-file:///${filePath.replace(/\\/g, '/')}` : `local-file://${filePath}`;
}
function resolveChannelBranding(rawConfig, options = {}) {
  const config = parseChannelBrandingConfig(rawConfig);
  if (!config) return undefined;
  const env = options.env || process.env;
  const channel = normalizeString(config.channelId) || normalizeString(env[config.envKey || 'WORKBUDDY_USER_CHANNEL']);
  const entry = channel && config.channels[channel];
  const logo = typeof entry === 'string' ? normalizeString(entry) : normalizeString(entry?.welcomeLogo);
  const segments = toSafeAssetSegments(logo);
  const resolved = segments && options.resolveAsset?.(...segments);
  if (!channel || !resolved) return undefined;
  return { channel, envKey: config.envKey || 'WORKBUDDY_USER_CHANNEL', welcomeLogoUrl: toLocalFileUrl(resolved, options.platform), ...(typeof entry === 'object' ? { ...(entry.welcomeLogoAlt ? { welcomeLogoAlt: entry.welcomeLogoAlt } : {}), ...(entry.welcomeToastZh ? { welcomeToastZh: entry.welcomeToastZh } : {}), ...(entry.welcomeToastEn ? { welcomeToastEn: entry.welcomeToastEn } : {}) } : {}) };
}
module.exports = Object.freeze({ normalizeString, parseChannelBrandingConfig, resolveChannelBranding, toLocalFileUrl, toSafeAssetSegments });
