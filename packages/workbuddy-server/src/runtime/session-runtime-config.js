'use strict';
const WEIXINPAY_BUILTIN_PLUGIN_ID = 'weixinpay@workbuddy-builtin';
function withSessionEnabledPluginSetting(settings, pluginId, enabled) { const current = settings?.enabledPlugins; const enabledPlugins = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {}; enabledPlugins[pluginId] = enabled; return { ...(settings || {}), enabledPlugins }; }
function summarizeSystemPrompt(systemPrompt) { return systemPrompt === undefined ? undefined : { length: systemPrompt.length, preview: systemPrompt.slice(0, 300) }; }
function isClawRuntimeCwd(cwd, clawCwd) { if (!cwd?.trim() || !clawCwd?.trim()) return false; try { return require('path').resolve(cwd).toLowerCase() === require('path').resolve(clawCwd).toLowerCase(); } catch { return false; } }
module.exports = Object.freeze({ WEIXINPAY_BUILTIN_PLUGIN_ID, withSessionEnabledPluginSetting, summarizeSystemPrompt, isClawRuntimeCwd });
