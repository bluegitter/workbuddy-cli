'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getWorkbuddyRuntimeConfigDir } = require('./runtime-context');
const { SessionMetaWriter } = require('../session/session-meta/session-meta-writer');
const { adaptSessionDiagnosticsLogger } = require('../session/diagnostics-logger-adapter');
const { createSessionRuntimeConfigResolver } = require('../session/session-runtime-config-resolver');

const SKILL_MANAGE_TOOL_NAME = 'SkillManage';
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PRODUCT_FEATURE_DISABLED_TOOLS = [{ feature: 'WebSearch', tool: 'WebSearch' }];
const CLAW_DISABLED_TOOLS = Object.freeze(['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'Agent', 'TeamCreate', 'TeamDelete', 'SendMessage', 'ImageGen']);

function isClawWorkspaceCwd(cwd, clawCwd) {
  if (!cwd?.trim() || !clawCwd) return false;
  return path.resolve(cwd.trim()).toLowerCase() === path.resolve(clawCwd).toLowerCase();
}
function chainDisabledToolsResolvers(resolvers) {
  return (ctx) => {
    let current = ctx.callerDisabledTools; let changed = false;
    for (const resolver of resolvers) {
      const next = resolver({ ...ctx, callerDisabledTools: current });
      if (next !== undefined) { current = next; changed = true; }
    }
    return changed ? current : undefined;
  };
}
function createWorkbuddyAppServerSkillManageDisabledToolsResolver(isDisabled) {
  return ({ callerDisabledTools }) => { if (!isDisabled?.()) return; const caller = callerDisabledTools ?? []; return caller.includes(SKILL_MANAGE_TOOL_NAME) ? undefined : [...caller, SKILL_MANAGE_TOOL_NAME]; };
}
function createWorkbuddyAppServerProductFeaturesDisabledToolsResolver(getProductFeatures) {
  return ({ callerDisabledTools }) => {
    const features = getProductFeatures?.(); if (!features) return;
    const disabled = PRODUCT_FEATURE_DISABLED_TOOLS.filter(({ feature }) => features[feature] === false).map(({ tool }) => tool); if (disabled.length === 0) return;
    const merged = new Set(callerDisabledTools ?? []); let changed = false;
    for (const tool of disabled) if (!merged.has(tool)) { merged.add(tool); changed = true; }
    return changed ? [...merged] : undefined;
  };
}
function createWorkbuddyAppServerClawDisabledToolsResolver(options = {}) {
  const clawDisabledTools = options.clawDisabledTools ?? CLAW_DISABLED_TOOLS;
  const isClaw = options.isClawWorkspaceCwd ?? isClawWorkspaceCwd;
  return ({ cwd, callerDisabledTools }) => { if (!isClaw(cwd, options.clawCwd)) return; const merged = new Set(clawDisabledTools); for (const tool of callerDisabledTools ?? []) merged.add(tool); return [...merged]; };
}
function createWorkbuddyAppServerBeforePromptExpertActivation(options) {
  const applied = new Map();
  return async ({ sessionId, desiredConfig, backendRestarted }) => {
    options.recordSessionMeta?.(sessionId);
    const previous = applied.get(sessionId); if (backendRestarted) applied.delete(sessionId);
    const expertId = desiredConfig.expertId;
    if (!expertId) {
      if (previous && !backendRestarted) try { await options.expertPluginService.switchExpertPluginForSession(sessionId, previous.pluginName, undefined, undefined, undefined); options.logger?.info?.(`[ExpertPluginActivation] clear sessionId=${sessionId} plugin=${previous.pluginName}`); } catch (error) { options.logger?.warn?.('[ExpertPluginActivation] clear failed', error); }
      applied.delete(sessionId); options.agentTeamsEnvResolver?.recordSessionExpertType(sessionId, undefined); return;
    }
    const requestedKey = typeof desiredConfig.runtimeIdentity === 'string' && desiredConfig.runtimeIdentity.trim() ? desiredConfig.runtimeIdentity : `expert:${expertId}`;
    const resolved = await options.expertPluginService.resolveExpertLocation(expertId, desiredConfig.expertMarketplace);
    if (!resolved) { options.logger?.warn?.(`[ExpertPluginActivation] resolve failed; degrade sessionId=${sessionId} expertId=${expertId}`); return; }
    const { manifest, marketplace, agentName } = resolved;
    const headers = { 'X-Expert-Id': expertId, ...(manifest.expertType === 'team' ? { 'X-Expert-Team-Task': 'true' } : {}) };
    options.agentTeamsEnvResolver?.recordSessionExpertType(sessionId, manifest.expertType);
    const activationKey = `${requestedKey}:internalModelRequestHeaders=${JSON.stringify(headers)}`;
    const current = applied.get(sessionId);
    if (current?.activationKey === activationKey && await options.expertPluginService.isExpertPluginEnabledForSession(sessionId, current.pluginName, marketplace)) return;
    const pluginName = manifest.name;
    try { if (await options.expertPluginService.switchExpertPluginForSession(sessionId, undefined, pluginName, agentName, `${pluginName}@${marketplace}`, headers)) applied.set(sessionId, { activationKey, pluginName }); else options.logger?.warn?.(`[ExpertPluginActivation] switch not applied; degrade sessionId=${sessionId} expertId=${expertId}`); } catch (error) { options.logger?.warn?.('[ExpertPluginActivation] switch failed; degrade to current prompt', error); }
  };
}
async function removeSandboxSessionDirectory(sessionId, logger) {
  if (!SESSION_ID_PATTERN.test(sessionId)) { logger?.info?.('[SessionManager] invalid sessionId format, skip cleanup', { sessionId }); return; }
  const sessionsRoot = path.join(getWorkbuddyRuntimeConfigDir(), 'workspace', 'sessions');
  const sandboxSessionDir = path.resolve(sessionsRoot, sessionId);
  if (!sandboxSessionDir.startsWith(`${sessionsRoot}${path.sep}`)) { logger?.info?.('[SessionManager] path traversal detected, skip cleanup', { sessionId, resolved: sandboxSessionDir }); return; }
  try { await fs.promises.rm(sandboxSessionDir, { recursive: true, force: true }); logger?.info?.('[SessionManager] sandbox session dir cleaned', { sessionId, path: sandboxSessionDir }); } catch (error) { logger?.info?.('[SessionManager] failed to clean sandbox session dir', { sessionId, path: sandboxSessionDir, error: error instanceof Error ? error.message : String(error) }); }
}
function initializeWorkbuddyAppServerSessionManager(options) {
  const celljs = options.celljs;
  const sessionMetaWriter = options.userDataDir ? new SessionMetaWriter(options.userDataDir, celljs.logger) : undefined;
  const recordSessionMeta = sessionMetaWriter ? (sessionId) => { const view = options.sessionManager.getSession?.(sessionId); if (view?.cwd) sessionMetaWriter.record({ conversationId: sessionId, userId: options.getCurrentUserId?.() ?? '', workDir: view.cwd }).catch(() => {}); } : undefined;
  options.sessionManager.initialize({
    createBackend: options.createBackend,
    recordStore: options.sessionPersistence.recordStore,
    usageCacheService: options.sessionPersistence.usageCacheService,
    runtimeConfigResolver: createSessionRuntimeConfigResolver(Promise.resolve({ logger: celljs.logger, systemPromptService: celljs.systemPromptService })),
    userPromptComposer: celljs.userPromptService,
    logger: adaptSessionDiagnosticsLogger(celljs.logger),
    disabledToolsResolver: chainDisabledToolsResolvers([
      createWorkbuddyAppServerSkillManageDisabledToolsResolver(options.isLocalSkillsMemoryDisabled),
      createWorkbuddyAppServerProductFeaturesDisabledToolsResolver(options.getProductFeatures),
      createWorkbuddyAppServerClawDisabledToolsResolver({ clawCwd: options.clawCwd, clawDisabledTools: options.clawDisabledTools, isClawWorkspaceCwd: options.isClawWorkspaceCwd }),
    ]),
    onBeforePrompt: createWorkbuddyAppServerBeforePromptExpertActivation({ expertPluginService: celljs.expertPluginService, agentTeamsEnvResolver: options.agentTeamsEnvResolver, logger: options.logger, recordSessionMeta }),
    onAfterDelete: (sessionId) => removeSandboxSessionDirectory(sessionId, options.logger),
    toolUsageObserver: options.toolUsageObserver,
    reportTelemetry: options.reportTelemetry,
    poiQuestionRegistry: options.poiQuestionRegistry,
  });
}

module.exports = Object.freeze({ SKILL_MANAGE_TOOL_NAME, SESSION_ID_PATTERN, PRODUCT_FEATURE_DISABLED_TOOLS, CLAW_DISABLED_TOOLS, isClawWorkspaceCwd, chainDisabledToolsResolvers, createWorkbuddyAppServerSkillManageDisabledToolsResolver, createWorkbuddyAppServerProductFeaturesDisabledToolsResolver, createWorkbuddyAppServerClawDisabledToolsResolver, createWorkbuddyAppServerBeforePromptExpertActivation, removeSandboxSessionDirectory, initializeWorkbuddyAppServerSessionManager });
