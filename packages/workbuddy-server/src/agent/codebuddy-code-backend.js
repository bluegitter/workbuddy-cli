'use strict';

const path = require('node:path');
const { WorkbuddyACPClient } = require('../runtime/workbuddy-acp-client');
const { createWorkbuddyAgentAcpClient } = require('./acp-client');
const { normalizeBackendPermissionMode } = require('./cli-runtime-args');
const { buildCodeBuddyBackendEnv } = require('../runtime/codebuddy-backend-env');
const { readIsBackgroundAutomationMeta, extractCodeBuddyPromptTraceMeta, extractCliTraceId, extractCliOutcome } = require('../runtime/codebuddy-backend-utils');

const TAG = '[CodeBuddyCodeBackend]';
const VALID_PERMISSION_MODES = new Set(['fullAccess', 'plan', 'default', 'acceptEdits', 'bypassPermissions']);
const SANDBOX_DISABLED_REASON_META_KEY = 'codebuddy.ai/sandboxDisabledReason';

function isValidHex32(value) { return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value) && value !== '0'.repeat(32); }
function isClawWorkspaceCwd(cwd, clawCwd) { if (!cwd || !clawCwd) return false; return path.resolve(cwd).toLowerCase() === path.resolve(clawCwd).toLowerCase(); }

class CodeBuddyCodeBackend {
  id = 'codebuddy-code';
  name = 'CodeBuddy Code';
  capabilities = Object.freeze({ supportsPTY: true, supportsStreaming: true, supportsMCP: true });
  activeSessions = new Set();
  constructor(runtimeManager, dependencies = {}) { this.runtimeManager = runtimeManager; this.dependencies = dependencies; }
  create(params) { const session = new CodeBuddyCodeSessionBackend({ definition: this, runtimeManager: this.runtimeManager, dependencies: this.dependencies, params, onDisposed: (item) => this.activeSessions.delete(item) }); this.activeSessions.add(session); return session; }
  async resetActiveSessions(reason) { await Promise.all([...this.activeSessions].map((session) => session.softReset(reason).catch((error) => this.dependencies.logger?.warn?.(`${TAG} reset failed`, error)))); }
  async awaitOrphanCleanup() {}
  async dispose() { await Promise.all([...this.activeSessions].map((session) => session.dispose())); this.activeSessions.clear(); }
}

class CodeBuddyCodeSessionBackend {
  constructor(args) {
    this.id = args.definition.id; this.name = args.definition.name; this.capabilities = args.definition.capabilities;
    this.runtimeManager = args.runtimeManager; this.dependencies = args.dependencies; this.onDisposed = args.onDisposed;
    this.sessionId = args.params.sessionId; this.cwd = args.params.cwd; this.env = args.params.env; this.runtimeConfig = args.params.runtimeConfig || {};
    this.isBackgroundAutomation = readIsBackgroundAutomationMeta(args.params._meta); this.client = null; this.runtimeHandle = null; this.destroyed = false; this.promptSeq = 0;
    this.onSessionUpdate = null; this.onPermissionRequest = null; this.onQuestionRequest = null; this.onElicitationRequest = null; this.onExtNotification = null; this.onTransportActivity = null; this.onRuntimeSignal = null;
  }
  get debugSessionId() { return this.sessionId; }
  async initialize(request) { if (this.client) return { sessionId: this.sessionId }; const handle = await this.startRuntime(request); this.runtimeHandle = handle; this.client = createWorkbuddyAgentAcpClient({ ClientClass: this.dependencies.AcpClientClass || WorkbuddyACPClient, endpoint: handle.acpEndpoint || handle.endpoint, logger: this.dependencies.logger, supportsElicitation: !isClawWorkspaceCwd(this.cwd, this.dependencies.clawCwd), onSessionUpdate: (update) => this.onSessionUpdate?.(update), onPermissionRequest: (request) => this.onPermissionRequest?.(request), onQuestionRequest: (request) => this.onQuestionRequest?.(request), onElicitationRequest: (request) => this.onElicitationRequest?.(request), onExtNotification: (notification) => this.onExtNotification?.(notification), onTransportActivity: () => this.onTransportActivity?.() }); await this.client.connect(); return { sessionId: this.sessionId }; }
  async startRuntime(request) { if (this.runtimeManager?.createSession) return this.runtimeManager.createSession({ sessionId: this.sessionId, cwd: this.cwd, env: { ...buildCodeBuddyBackendEnv(this.env || {}, this.dependencies), ...(this.dependencies.extraEnv || {}) }, request }); if (this.dependencies.startRuntime) return this.dependencies.startRuntime({ sessionId: this.sessionId, cwd: this.cwd, request }); return { acpEndpoint: this.dependencies.endpoint }; }
  async prompt(request) { if (!this.client) await this.initialize({ kind: 'new', request: { sessionId: this.sessionId } }); this.promptSeq += 1; try { const result = await this.client.connection.prompt(request); return { ...result, _meta: { ...(result?._meta || {}), ...(extractCliTraceId(result?._meta) ? { 'codebuddy.ai/traceId': extractCliTraceId(result._meta) } : {}), ...(extractCliOutcome(result?._meta) ? { 'codebuddy.ai/outcome': extractCliOutcome(result._meta) } : {}) } }; } catch (error) { const traceId = error?._meta && extractCliTraceId(error._meta); if (traceId) error._meta = { ...error._meta, 'codebuddy.ai/traceId': traceId }; throw error; } }
  async cancel() { if (!this.client) return; await this.client.connection.cancel({ sessionId: this.sessionId }); }
  async reconfigure(config = {}) { this.runtimeConfig = { ...this.runtimeConfig, ...config }; return { restartRequired: false }; }
  resolveInterruption(sessionId, toolCallId, decision, answers) { return this.client?.resolveInterruption(sessionId, toolCallId, decision, answers); }
  respondToSandboxIntercept(payload) { return this.client?.connection.extMethod('_codebuddy.ai/respondToSandboxIntercept', payload); }
  async softReset() { await this.client?.disconnect(); this.client = null; this.runtimeHandle = null; }
  async dispose() { if (this.destroyed) return; this.destroyed = true; await this.client?.disconnect(); await this.runtimeHandle?.dispose?.(); await this.runtimeManager?.killSession?.(this.sessionId); this.client = null; this.runtimeHandle = null; this.onDisposed?.(this); }
  async kill() { return this.dispose(); }
  get connection() { return this.client?.connection; }
}

module.exports = Object.freeze({ TAG, VALID_PERMISSION_MODES, SANDBOX_DISABLED_REASON_META_KEY, isValidHex32, isClawWorkspaceCwd, normalizeBackendPermissionMode, CodeBuddyCodeBackend, CodeBuddyCodeSessionBackend });
