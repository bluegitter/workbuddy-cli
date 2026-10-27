'use strict';


const DEFAULT_VERSION = 1;
const MAX_INBOX_ITEMS = 200;
const MAX_OUTPUT_LENGTH = 4000;
const MAX_WECHAT_PUSH_CONTENT_LENGTH = 20000;
const RUNNING_STATE_GRACE_MS = 7200 * 1000;
const SCHEDULED_RUN_GRACE_MS = 35000;
const PRE_SESSION_TIMEOUT_MS = 60000;
const MAX_CONCURRENT_CWD_RUNS = 3;
const AUTOMATION_WORKSPACE_PREFIX = 'automation';
const AUTOMATION_NO_MEANINGFUL_OUTPUT_ERROR = 'Automation finished without meaningful output';
const AUTOMATION_SIDE_EFFECT_ONLY_SUMMARY = 'Automation completed successfully';
const AUTOMATION_LOCAL_FILE_MUTATION_SUMMARY = 'Updated local files';
const AUTOMATION_ARTIFACT_SUMMARY = 'Generated deliverable files';
const AUTOMATION_PARTIAL_DELIVERED_SUMMARY = 'Generated results, but final wrap-up was interrupted';

function formatAutomationWorkspaceTimestamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function compactAutomationRunMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message) => {
    const core = message?.message ?? message;
    if (core?.role !== 'tool' || !Array.isArray(core.content)) return [];
    const content = core.content.filter((part) => part?.type === 'tool-result').map((part) => ({
      type: 'tool-result',
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      result: typeof part.result?.success === 'boolean' ? { success: part.result.success } : undefined,
    }));
    return content.length ? [{ role: 'tool', content }] : [];
  });
}

function compactAutomationRunResult(runResult) {
  if (!runResult) return undefined;
  const compact = {};
  const messages = compactAutomationRunMessages(runResult.messages);
  if (messages.length) compact.messages = messages;
  if (runResult.usage) compact.usage = { ...runResult.usage };
  if (runResult.error) compact.error = {
    code: runResult.error.code,
    error: runResult.error.error ? {
      name: runResult.error.error.name,
      message: runResult.error.error.message,
      stack: runResult.error.error.stack?.slice(0, MAX_OUTPUT_LENGTH),
    } : undefined,
  };
  if (runResult.requestId) compact.requestId = runResult.requestId;
  return Object.keys(compact).length ? compact : undefined;
}

/** Compatibility facade for the recovered AutomationMainService boundary. */
class AutomationMainService {
  constructor(options = {}) {
    this.options = options;
    this.logger = options.logger || console;
    this.storage = options.storage;
    this.scheduler = options.scheduler;
    this.runtimeState = {};
    this.running = new Set();
    this.ready = false;
    this.snapshotSink = options.snapshotSink;
    this.executeRunHandler = options.executeRunHandler;
  }

  setExecuteRunHandler(handler) { this.executeRunHandler = handler; }
  setSnapshotSink(sink) { this.snapshotSink = sink; }
  async initialize() { await this.storage?.initialize?.(); this.runtimeState = await this.storage?.readRuntimeState?.() || {}; this.scheduler?.start?.(); this.ready = true; await this.snapshotSink?.(this.getRuntimeState()); return this; }
  dispose() { this.scheduler?.stop?.(); this.storage?.dispose?.(); this.ready = false; }
  getRunningAutomationIds() { return this.running; }
  getRuntimeState() { return this.runtimeState; }
  setReady(ready) { this.ready = ready; }
  async executeViaCli(request) {
    if (this.executeRunHandler) return this.executeRunHandler(request);
    if (!this.options.sessionManager?.prompt) return { success: false, error: 'session manager unavailable' };
    return this.options.sessionManager.prompt(request.sessionId, request.prompt || request.automation?.prompt || '', { 'codebuddy.automation': { automationId: request.automation?.id } });
  }
  getAutomationWorkspaceRoot() { return this.options?.automationWorkspaceRoot; }
  getRunKind(runId) { return String(runId || '').startsWith(`${AUTOMATION_WORKSPACE_PREFIX}-`) ? 'automation' : 'unknown'; }
  getAutomationTestMessage(key, variables = {}) { const templates = { triggered: '已触发测试运行。', executionServiceNotReady: '自动化执行服务尚未就绪，请稍后再试。', ...this.options?.testMessages }; return String(templates[key] || key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables[name] ?? '')); }
}

module.exports = Object.freeze({
  DEFAULT_VERSION, MAX_INBOX_ITEMS, MAX_OUTPUT_LENGTH, MAX_WECHAT_PUSH_CONTENT_LENGTH,
  RUNNING_STATE_GRACE_MS, SCHEDULED_RUN_GRACE_MS, PRE_SESSION_TIMEOUT_MS,
  MAX_CONCURRENT_CWD_RUNS, AUTOMATION_WORKSPACE_PREFIX,
  AUTOMATION_NO_MEANINGFUL_OUTPUT_ERROR, AUTOMATION_SIDE_EFFECT_ONLY_SUMMARY,
  AUTOMATION_LOCAL_FILE_MUTATION_SUMMARY, AUTOMATION_ARTIFACT_SUMMARY,
  AUTOMATION_PARTIAL_DELIVERED_SUMMARY, formatAutomationWorkspaceTimestamp,
  compactAutomationRunMessages, compactAutomationRunResult, AutomationMainService,
});
