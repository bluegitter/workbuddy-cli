'use strict';

const crypto = require('crypto');

function logger(ctx) { return ctx.logger || { info() {}, warn() {} }; }
function errorText(error) { return error?.message || String(error); }

async function handleSessionCreate(ctx, cmd) {
  const log = logger(ctx);
  const cwd = cmd.cwd || cmd.workDir;
  log.info(`[EdgeSync] SESSION.CREATE: mode=${cmd.mode || 'default'} model=${cmd.model || '(default)'} cwd=${cwd || '(default)'}`);
  try {
    if (!ctx.deps.createSession) return { success: false, error: 'createSession not available' };
    const opts = {};
    for (const key of ['mode', 'model', 'expertId', 'expertMarketplace', 'locale', 'systemPrompt', 'tools', 'permissionMode', 'disabledTools', 'env', 'backendId', 'projectId']) if (cmd[key]) opts[key] = cmd[key];
    if (cwd) opts.cwd = cwd;
    if (!cwd) opts.isPlayground = true;
    else if (cmd.isPlayground !== undefined) opts.isPlayground = cmd.isPlayground;
    if (cmd.sessionOptions && typeof cmd.sessionOptions === 'object') {
      const { sessionId: _sessionId, preGeneratedSessionId: _preGeneratedSessionId, ...safeOptions } = cmd.sessionOptions;
      Object.assign(opts, safeOptions);
    }
    const preGeneratedSessionId = crypto.randomUUID();
    opts.sessionId = preGeneratedSessionId;
    ctx.edgeLog?.('SESSION_CREATE', `cwd=${cwd || '(empty)'} isPlayground=${opts.isPlayground}`);
    ctx.markRemoteCreatedSession?.(preGeneratedSessionId);
    const sessionId = (await ctx.deps.createSession(opts))?.sessionId ?? preGeneratedSessionId;
    return { success: true, sessionId };
  } catch (error) {
    log.warn(`[EdgeSync] SESSION.CREATE failed: ${errorText(error)}`);
    return { success: false, error: errorText(error) };
  }
}

async function handlePromptSubmit(ctx, cmd, options = {}) {
  const log = logger(ctx);
  const edgeLog = options.edgeLog || (() => {});
  const localizeRemoteImages = options.localizeRemoteImages || (async () => {});
  const publishPromptError = options.publishPromptError || (() => {});
  const contentBlocks = Array.isArray(cmd.content) && cmd.content.length > 0 ? cmd.content : [{ type: 'text', text: cmd.prompt || '' }];
  await localizeRemoteImages(contentBlocks, cmd.sessionId || '', ctx);
  const promptPreview = contentBlocks.filter((block) => block.type === 'text' && block.text).map((block) => block.text).join(' ').slice(0, 100);
  const promptOpts = {};
  for (const key of ['mode', 'attachments', 'expertId', 'expertMarketplace', 'locale', 'model', 'systemPrompt', 'tools', 'permissionMode', 'disabledTools', 'env', 'backendId', 'projectId']) if (cmd[key] !== undefined) promptOpts[key] = cmd[key];
  const cwd = cmd.cwd || cmd.workDir;
  if (cwd) promptOpts.cwd = cwd;
  if (!cwd) promptOpts.isPlayground = true;
  else if (cmd.isPlayground !== undefined) promptOpts.isPlayground = cmd.isPlayground;
  if (cmd.sessionOptions && typeof cmd.sessionOptions === 'object') {
    const { sessionId: _sessionId, preGeneratedSessionId: _preGeneratedSessionId, ...safeOptions } = cmd.sessionOptions;
    promptOpts.sessionOptions = safeOptions;
  }
  if (!cmd.sessionId) {
    promptOpts.preGeneratedSessionId = crypto.randomUUID();
    ctx.markRemoteCreatedSession?.(promptOpts.preGeneratedSessionId);
    ctx.bindTurnTraceSession?.(promptOpts.preGeneratedSessionId);
  }
  log.info(`[EdgeSync] PROMPT.SUBMIT: sid=${cmd.sessionId || '(auto-create)'} prompt="${promptPreview}"`);
  edgeLog('PROMPT_SUBMIT_ENTER', `sid=${cmd.sessionId || '(auto)'} promptLen=${promptPreview.length}`);
  try {
    if (!ctx.deps.submitPrompt) return { success: true };
    const preGeneratedUserMessageId = crypto.randomUUID();
    const traceSessionId = cmd.sessionId || promptOpts.preGeneratedSessionId;
    if (traceSessionId) ctx.bindTurnTraceMessages?.(traceSessionId, [preGeneratedUserMessageId]);
    const echo = (sessionId, messageId) => {
      if (!sessionId || !ctx.pushToRenderer) return;
      const echoBlocks = contentBlocks.map((block) => block.type === 'image' && block.uri ? { type: 'image', uri: block.uri, mimeType: block.mimeType } : block);
      ctx.pushToRenderer(sessionId, { sessionId, update: { sessionUpdate: 'user_message_chunk', messageId, content: echoBlocks, _meta: { 'codebuddy.ai': { chunkSeq: 0, emitSyntheticUserPromptLive: true } } }, _meta: { messageId, 'codebuddy.ai': { messageId, synthetic: true, source: 'edge-sync-submit-prompt', emitSyntheticUserPromptLive: true, timestamp: new Date().toISOString() } } });
      ctx.pushToRenderer(sessionId, { sessionId, id: sessionId, name: promptPreview.slice(0, 30) || '新任务' }, 'session:upserted');
    };
    if (cmd.sessionId) try { echo(cmd.sessionId, preGeneratedUserMessageId); } catch (error) { log.warn(`[EdgeSync] PROMPT.ECHO(pre) failed: ${errorText(error)}`); }
    const metaWithSource = { ...(cmd._meta || {}), 'codebuddy.ai/promptSource': 'edge-sync', 'codebuddy.ai/userMessageId': preGeneratedUserMessageId, 'codebuddy.ai': { ...(cmd._meta?.['codebuddy.ai'] || {}), userMessageId: preGeneratedUserMessageId } };
    const result = await ctx.deps.submitPrompt(cmd.sessionId, contentBlocks, metaWithSource, promptOpts);
    const effectiveSessionId = result && typeof result === 'object' && 'sessionId' in result ? result.sessionId : cmd.sessionId;
    const cliUserMessageId = result && typeof result === 'object' && 'userMessageId' in result ? result.userMessageId : undefined;
    if (effectiveSessionId) ctx.bindTurnTraceMessages?.(effectiveSessionId, cliUserMessageId ? [preGeneratedUserMessageId, cliUserMessageId] : [preGeneratedUserMessageId]);
    if (!cmd.sessionId && effectiveSessionId) try { echo(effectiveSessionId, cliUserMessageId || preGeneratedUserMessageId); } catch (error) { edgeLog('AUTO_CREATE_ECHO_FAIL', `err=${errorText(error)}`); }
    edgeLog('PROMPT_SUBMIT_OK', `sid=${effectiveSessionId || '(none)'} userMessageId=${cliUserMessageId || '(none)'}`);
    return { success: true, sessionId: effectiveSessionId };
  } catch (error) {
    log.warn(`[EdgeSync] PROMPT.SUBMIT failed: ${errorText(error)}`);
    const errorCode = typeof error?.code === 'number' ? error.code : typeof error?.bizCode === 'number' ? error.bizCode : undefined;
    const errorInfo = { message: errorText(error) };
    if (errorCode !== undefined) errorInfo.code = errorCode;
    if (error?.data !== undefined) errorInfo.details = error.data;
    publishPromptError(ctx, cmd.sessionId, error);
    edgeLog('PROMPT_SUBMIT_FAIL', `err=${errorText(error)}`);
    return { success: false, error: errorInfo };
  }
}

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

module.exports = Object.freeze({ handleSessionCreate, handlePromptSubmit, handleSessionStop, handleGetAutomations, handleGetTaskArtifacts, handleGetModels, handleGetSessionConfig, handleGetSkills });
