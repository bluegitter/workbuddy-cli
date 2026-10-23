'use strict';

function logger(ctx) { return ctx.logger || { info() {}, warn() {} }; }
function errorText(error) { return error?.message || String(error); }

async function handleSessionStop(ctx, cmd) {
  const log = logger(ctx);
  log.info(`[EdgeSync] STOP: sid=${cmd.sessionId} commandId=${cmd.commandId}`);
  try {
    if (ctx.deps.cancelSession) await ctx.deps.cancelSession(cmd.sessionId);
    else log.warn('[EdgeSync] STOP: cancelSession not provided');
    return { success: true };
  } catch (error) { log.warn(`[EdgeSync] STOP failed: ${errorText(error)}`); return { success: false }; }
}
async function handleGetAutomations(ctx, cmd) {
  const log = logger(ctx);
  log.info(`[EdgeSync] GET_AUTOMATIONS: commandId=${cmd.commandId}`);
  if (!ctx.deps.getAutomationSnapshot) return { success: false, error: 'automation_not_available' };
  try { return { success: true, snapshot: await ctx.deps.getAutomationSnapshot() }; }
  catch (error) { log.warn(`[EdgeSync] GET_AUTOMATIONS failed: ${errorText(error)}`); return { success: false, error: errorText(error) }; }
}
async function handleGetTaskArtifacts(ctx, cmd) {
  const { sessionId, commandId } = cmd;
  const log = logger(ctx);
  log.info(`[EdgeSync] GET_TASK_ARTIFACTS: sid=${sessionId} commandId=${commandId}`);
  if (!ctx.deps.getSessionArtifacts) return { success: false, error: 'artifacts_not_available' };
  try { return { success: true, sessionId, artifacts: await ctx.deps.getSessionArtifacts(sessionId) }; }
  catch (error) { log.warn(`[EdgeSync] GET_TASK_ARTIFACTS failed: sid=${sessionId} err=${errorText(error)}`); return { success: false, sessionId, error: errorText(error) }; }
}
async function handleGetModels(ctx, cmd) {
  const log = logger(ctx);
  log.info(`[EdgeSync] GET_MODELS: commandId=${cmd.commandId}`);
  try { return ctx.deps.getProductConfiguration ? { success: true, data: await ctx.deps.getProductConfiguration() } : { success: false }; }
  catch (error) { log.warn(`[EdgeSync] GET_MODELS failed: ${errorText(error)}`); return { success: false }; }
}
async function handleGetSessionConfig(ctx, cmd) {
  const log = logger(ctx);
  log.info(`[EdgeSync] GET_SESSION_CONFIG: sid=${cmd.sessionId} commandId=${cmd.commandId}`);
  try { return ctx.deps.getSessionConfig ? { success: true, data: await ctx.deps.getSessionConfig(cmd.sessionId) } : { success: false }; }
  catch (error) { log.warn(`[EdgeSync] GET_SESSION_CONFIG failed: ${errorText(error)}`); return { success: false }; }
}
async function handleGetSkills(ctx, cmd) {
  const log = logger(ctx);
  log.info(`[EdgeSync] GET_SKILLS: commandId=${cmd.commandId}`);
  try { return ctx.deps.getInstalledSkills ? { success: true, data: await ctx.deps.getInstalledSkills() } : { success: false }; }
  catch (error) { log.warn(`[EdgeSync] GET_SKILLS failed: ${errorText(error)}`); return { success: false }; }
}

module.exports = Object.freeze({ handleSessionStop, handleGetAutomations, handleGetTaskArtifacts, handleGetModels, handleGetSessionConfig, handleGetSkills });
