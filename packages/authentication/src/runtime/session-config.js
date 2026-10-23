'use strict';

const CRAFT_TOOLS = Object.freeze([
  'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Bash', 'PowerShell',
  'TaskCreate', 'TaskGet', 'TaskUpdate', 'TaskList', 'TaskStop', 'TaskOutput',
  'WebFetch', 'WebSearch', 'Skill', 'SkillManage', 'AskUserQuestion', 'LSP',
  'ImageGen', 'VideoGen', 'Agent', 'TeamCreate', 'TeamDelete', 'SendMessage',
  'ToolSearch', 'DeferExecuteTool', 'ListMcpResources', 'ReadMcpResource',
]);
const PLAN_TOOLS = Object.freeze([...CRAFT_TOOLS, 'EnterPlanMode', 'ExitPlanMode']);
const MODE_TOOLS_CONFIG = Object.freeze({
  craft: CRAFT_TOOLS.join(','),
  ask: ['Read', 'AskUserQuestion', 'WebFetch', 'WebSearch', 'Glob', 'Grep'].join(','),
  plan: PLAN_TOOLS.join(','),
  expert: PLAN_TOOLS.join(','),
});
const SESSION_SANDBOX_DISABLED_REASONS = Object.freeze([
  'security-center-setting-disabled',
  'session-local-environment-selected',
  'background-automation-no-approval-ui',
]);
const SESSION_WELCOME_MODES = Object.freeze(['coding', 'working', 'design']);
const DEFAULT_MODE_PERMISSION_CONFIG = Object.freeze({
  craft: 'bypassPermissions', ask: 'default', plan: 'plan', expert: 'bypassPermissions',
});

function resolveModeTools(mode) { return MODE_TOOLS_CONFIG[mode] ?? MODE_TOOLS_CONFIG.craft; }
function normalizeSessionSandboxDisabledReason(value) { return typeof value === 'string' && SESSION_SANDBOX_DISABLED_REASONS.includes(value) ? value : undefined; }
function isSessionWelcomeMode(value) { return typeof value === 'string' && SESSION_WELCOME_MODES.includes(value); }
function normalizeSceneMode(mode) { return ['craft', 'ask', 'plan', 'expert'].includes(mode) ? mode : undefined; }
function normalizeWelcomeMode(mode) { return isSessionWelcomeMode(mode) ? mode : undefined; }
function normalizePermissionMode(mode) { return ['acceptEdits', 'bypassPermissions', 'fullAccess', 'default', 'plan'].includes(mode) ? mode : undefined; }
function normalizeNonPlanPermissionMode(mode) { const normalized = normalizePermissionMode(mode); return normalized && normalized !== 'plan' ? normalized : undefined; }
function normalizeRuntimeIdentity(identity) { return typeof identity === 'string' && identity.trim() ? identity : undefined; }
function normalizeSessionSettings(settings) { return settings && typeof settings === 'object' && !Array.isArray(settings) ? { ...settings } : undefined; }
function cloneDesiredConfig(config) { return config ? { ...config } : {}; }
function cloneResolvedRuntimeConfig(config) { return config ? { ...config } : {}; }

function normalizeDesiredConfig(config = {}) {
  const rawPermissionMode = normalizePermissionMode(config.permissionMode);
  const permissionMode = config.mode === 'plan'
    ? 'plan'
    : rawPermissionMode === 'plan'
      ? normalizeNonPlanPermissionMode(config.permissionModeBeforePlan) ?? 'bypassPermissions'
      : rawPermissionMode;
  return {
    mode: normalizeSceneMode(config.mode), expertId: config.expertId, expertMarketplace: config.expertMarketplace,
    locale: config.locale, runtimeIdentity: normalizeRuntimeIdentity(config.runtimeIdentity), model: config.model,
    systemPrompt: config.systemPrompt, tools: config.tools, permissionMode,
    permissionModeBeforePlan: normalizeNonPlanPermissionMode(config.permissionModeBeforePlan),
    useSandboxCLI: config.useSandboxCLI,
    sandboxDisabledReason: config.useSandboxCLI === false ? normalizeSessionSandboxDisabledReason(config.sandboxDisabledReason) : undefined,
    welcomeMode: normalizeWelcomeMode(config.welcomeMode), sessionSettings: normalizeSessionSettings(config.sessionSettings),
  };
}

function buildSessionRestartFingerprint(input = {}) {
  return JSON.stringify({
    v: 1, mode: input.mode, expertId: input.expertId, expertMarketplace: input.expertMarketplace,
    locale: input.locale, runtimeIdentity: input.runtimeIdentity, explicitSystemPrompt: input.explicitSystemPrompt,
    tools: input.tools, welcomeMode: input.welcomeMode, cwd: input.cwd,
    permissionModeBeforePlan: input.permissionModeBeforePlan,
  });
}
function resolveDefaultPermissionMode(mode) { return DEFAULT_MODE_PERMISSION_CONFIG[mode ?? 'craft']; }
function resolveDefaultTools(mode) { return resolveModeTools(mode); }
function buildFallbackRuntimeConfig(desiredConfig = {}) {
  const runtimeIdentity = normalizeRuntimeIdentity(desiredConfig.runtimeIdentity);
  const tools = desiredConfig.tools ?? resolveDefaultTools(desiredConfig.mode);
  return {
    model: desiredConfig.model, systemPrompt: desiredConfig.systemPrompt,
    restartFingerprint: buildSessionRestartFingerprint({
      mode: desiredConfig.mode ?? 'craft', expertId: desiredConfig.expertId,
      expertMarketplace: desiredConfig.expertMarketplace, locale: desiredConfig.locale,
      runtimeIdentity, explicitSystemPrompt: desiredConfig.systemPrompt, tools,
      welcomeMode: desiredConfig.welcomeMode, cwd: undefined,
      permissionModeBeforePlan: desiredConfig.permissionModeBeforePlan,
    }),
    tools, permissionMode: desiredConfig.permissionMode ?? resolveDefaultPermissionMode(desiredConfig.mode),
    ...(desiredConfig.permissionModeBeforePlan ? { permissionModeBeforePlan: desiredConfig.permissionModeBeforePlan } : {}),
    ...(runtimeIdentity ? { runtimeIdentity } : {}),
    ...(desiredConfig.welcomeMode ? { welcomeMode: desiredConfig.welcomeMode } : {}),
    ...(desiredConfig.sessionSettings ? { sessionSettings: desiredConfig.sessionSettings } : {}),
  };
}

module.exports = Object.freeze({
  CRAFT_TOOLS, PLAN_TOOLS, MODE_TOOLS_CONFIG, SESSION_SANDBOX_DISABLED_REASONS,
  SESSION_WELCOME_MODES, DEFAULT_MODE_PERMISSION_CONFIG, resolveModeTools,
  normalizeSessionSandboxDisabledReason, isSessionWelcomeMode, normalizeSceneMode,
  normalizeWelcomeMode, normalizePermissionMode, normalizeNonPlanPermissionMode,
  normalizeRuntimeIdentity, normalizeSessionSettings, cloneDesiredConfig,
  cloneResolvedRuntimeConfig, normalizeDesiredConfig, buildSessionRestartFingerprint,
  resolveDefaultPermissionMode, resolveDefaultTools, buildFallbackRuntimeConfig,
});
