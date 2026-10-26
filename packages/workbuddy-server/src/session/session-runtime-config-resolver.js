'use strict';

const path = require('node:path');

const WEIXINPAY_BUILTIN_PLUGIN_ID = 'weixinpay@workbuddy-builtin';

function isClawRuntimeCwd(cwd, resolveClawCwd = () => undefined) {
  const trimmed = cwd?.trim();
  if (!trimmed) return false;
  try {
    const clawCwd = resolveClawCwd();
    return typeof clawCwd === 'string' && path.resolve(trimmed).toLowerCase() === path.resolve(clawCwd).toLowerCase();
  } catch { return false; }
}

function withSessionEnabledPluginSetting(settings, pluginId, enabled) {
  const existing = settings?.enabledPlugins;
  const enabledPlugins = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  enabledPlugins[pluginId] = enabled;
  return { ...(settings ?? {}), enabledPlugins };
}

function summarizeSystemPrompt(systemPrompt) {
  if (systemPrompt === undefined) return undefined;
  return { length: systemPrompt.length, preview: systemPrompt.slice(0, 300) };
}

function logResolverInfo(logger, message, details, formatLogDetailsSuffix = (value) => value ? ` ${JSON.stringify(value)}` : '') {
  logger?.info?.(`${message}${formatLogDetailsSuffix(details)}`);
}

function createSessionRuntimeConfigResolver(deps) {
  let modeServicePromise;
  const getModeService = async () => {
    if (!modeServicePromise) {
      modeServicePromise = Promise.resolve(deps).then(async (resolved) => {
        const ModeService = resolved.ModeService;
        if (!ModeService) throw new Error('ModeService dependency is required');
        return new ModeService({
          initialize: () => resolved.systemPromptService.initialize(),
          renderSystemPrompt: (options) => resolved.systemPromptService.renderSystemPrompt(options),
          cleanup: () => resolved.systemPromptService.cleanup(),
        }, resolved.logger);
      });
    }
    return modeServicePromise;
  };

  return {
    async resolveConfig(request) {
      const resolved = await Promise.resolve(deps);
      const desiredMode = request.desiredConfig.mode ?? 'craft';
      const desiredPermissionMode = desiredMode === 'plan' ? 'plan' : resolved.normalizePermissionMode(request.desiredConfig.permissionMode);
      const modeResolveInput = {
        mode: desiredMode,
        expertId: request.desiredConfig.expertId,
        expertMarketplace: request.desiredConfig.expertMarketplace,
        locale: request.desiredConfig.locale,
        runtimeIdentity: request.desiredConfig.runtimeIdentity,
        model: request.desiredConfig.model,
        sessionId: request.sessionId,
        cwd: request.cwd,
        permissionMode: desiredPermissionMode,
        systemPrompt: request.desiredConfig.systemPrompt,
        tools: request.desiredConfig.tools,
        welcomeMode: request.desiredConfig.welcomeMode,
      };
      logResolverInfo(resolved.logger, '[SessionRuntimeConfigResolver] resolveConfig input', { sessionId: request.sessionId, cwd: request.cwd, desiredConfig: { ...request.desiredConfig, systemPrompt: summarizeSystemPrompt(request.desiredConfig.systemPrompt) }, modeResolveInput: { ...modeResolveInput, systemPrompt: summarizeSystemPrompt(modeResolveInput.systemPrompt) } }, resolved.formatLogDetailsSuffix);
      const resolvedOptions = await (await getModeService()).resolveOptions(modeResolveInput);
      const sessionSettings = isClawRuntimeCwd(request.cwd, resolved.resolveClawCwd) ? withSessionEnabledPluginSetting(request.desiredConfig.sessionSettings, WEIXINPAY_BUILTIN_PLUGIN_ID, false) : request.desiredConfig.sessionSettings;
      const runtimeConfig = {
        model: request.desiredConfig.model,
        permissionMode: resolved.normalizePermissionMode(resolvedOptions.permissionMode),
        ...(request.desiredConfig.permissionModeBeforePlan ? { permissionModeBeforePlan: request.desiredConfig.permissionModeBeforePlan } : {}),
        tools: resolvedOptions.tools,
        systemPrompt: resolvedOptions.systemPrompt,
        restartFingerprint: resolved.buildSessionRestartFingerprint({ mode: desiredMode, expertId: request.desiredConfig.expertId, expertMarketplace: request.desiredConfig.expertMarketplace, locale: request.desiredConfig.locale, runtimeIdentity: request.desiredConfig.runtimeIdentity, explicitSystemPrompt: request.desiredConfig.systemPrompt, tools: resolvedOptions.tools, welcomeMode: request.desiredConfig.welcomeMode, cwd: request.cwd, permissionModeBeforePlan: request.desiredConfig.permissionModeBeforePlan }),
        ...(request.desiredConfig.runtimeIdentity ? { runtimeIdentity: request.desiredConfig.runtimeIdentity } : {}),
        ...(request.desiredConfig.welcomeMode ? { welcomeMode: request.desiredConfig.welcomeMode } : {}),
        ...(sessionSettings ? { sessionSettings } : {}),
      };
      logResolverInfo(resolved.logger, '[SessionRuntimeConfigResolver] resolveConfig output', { sessionId: request.sessionId, resolvedOptions: { ...resolvedOptions, systemPrompt: summarizeSystemPrompt(resolvedOptions.systemPrompt) }, runtimeConfig: { ...runtimeConfig, systemPrompt: summarizeSystemPrompt(runtimeConfig.systemPrompt) } }, resolved.formatLogDetailsSuffix);
      return runtimeConfig;
    },
  };
}

module.exports = Object.freeze({ WEIXINPAY_BUILTIN_PLUGIN_ID, isClawRuntimeCwd, withSessionEnabledPluginSetting, summarizeSystemPrompt, createSessionRuntimeConfigResolver });
