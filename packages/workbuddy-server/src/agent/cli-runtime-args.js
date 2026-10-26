'use strict';

const WORKBUDDY_AGENT_ALLOWED_TOOLS = Object.freeze([
  'present_files', 'read_me', 'show_widget', 'connect_cloud_service', 'WebFetch', 'Bash(mcporter:*)',
]);
const VALID_PERMISSION_MODES = new Set(['fullAccess', 'plan', 'default', 'acceptEdits', 'bypassPermissions']);

function normalizeBackendPermissionMode(mode) { return mode && VALID_PERMISSION_MODES.has(mode) ? mode : 'bypassPermissions'; }
function buildAgentCliRuntimeArgs({ runtimeConfig = {}, cwd, mcpConfig, systemPromptFile, language, envRouteMode } = {}) {
  const args = ['--permission-mode', normalizeBackendPermissionMode(runtimeConfig.permissionMode)];
  if (runtimeConfig.permissionModeBeforePlan) args.push('--permission-mode-before-plan', runtimeConfig.permissionModeBeforePlan);
  args.push('--allowedTools', ...WORKBUDDY_AGENT_ALLOWED_TOOLS);
  if (runtimeConfig.model) args.push('--model', runtimeConfig.model);
  if (runtimeConfig.tools !== undefined) args.push('--tools', runtimeConfig.tools);
  if (systemPromptFile) args.push('--system-prompt-file', systemPromptFile);
  else if (runtimeConfig.systemPrompt) args.push('--system-prompt', runtimeConfig.systemPrompt);
  const settings = { ...(runtimeConfig.sessionSettings || {}) };
  if (cwd) settings.trustedDirectories = [`${cwd.replace(/[/\\]+$/, '') || cwd}/**`];
  if (envRouteMode) settings.envRouteMode = envRouteMode;
  if (language) settings.language = language;
  if (Object.keys(settings).length) args.push('--settings', JSON.stringify(settings));
  if (mcpConfig) args.push('--mcp-config', mcpConfig, '--strict-mcp-config');
  return args;
}

module.exports = Object.freeze({ WORKBUDDY_AGENT_ALLOWED_TOOLS, VALID_PERMISSION_MODES, normalizeBackendPermissionMode, buildAgentCliRuntimeArgs });
