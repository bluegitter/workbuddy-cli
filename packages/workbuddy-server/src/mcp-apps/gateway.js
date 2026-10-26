'use strict';

const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

function resolveSchemaProperties(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  if (schema.properties && typeof schema.properties === 'object') return schema.properties;
  if (typeof schema.$ref !== 'string') return undefined;
  const match = /^#\/(definitions|\$defs)\/([^/]+)$/.exec(schema.$ref);
  const target = schema[match?.[1]]?.[match?.[2]];
  return target?.properties && typeof target.properties === 'object' ? target.properties : undefined;
}

function extractSchemaDefaults(schema) {
  const properties = resolveSchemaProperties(schema);
  if (!properties) return {};
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value && typeof value === 'object' && 'default' in value).map(([key, value]) => [key, value.default]));
}

function normalizeFileId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return undefined;
}

function secondsToMs(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : undefined; }

class AppGatewayService {
  static PENDING_TOOL_RESULTS_LIMIT = 256;

  constructor(deps) {
    this.deps = { logger: console, ...deps };
    this.instances = new Map();
    this.toolCallIdToInstanceId = new Map();
    this.pendingToolResults = new Map();
    this.openHostRequestedListeners = new Set();
    this.processedArdotCanvas = new Map();
    this.cachedPreloadUrl = undefined;
    deps.catalog.onChanged((apps) => {
      const active = new Set(apps.map((app) => app.mcpAppId));
      for (const [id, instance] of this.instances) if (!active.has(instance.appId)) this.dropInstance(id);
    });
  }

  listApps() { return this.deps.catalog.listApps(); }
  listInstances() { return [...this.instances.values()].map(({ html, ...instance }) => instance); }
  getInstance(id) { return this.instances.get(id); }
  dropInstance(id) {
    const instance = this.instances.get(id);
    if (!instance) return;
    this.instances.delete(id);
    if (instance.toolCallId && this.toolCallIdToInstanceId.get(instance.toolCallId) === id) this.toolCallIdToInstanceId.delete(instance.toolCallId);
  }

  async openHostApp(params = {}) {
    const app = params.appId ? this.deps.catalog.findById(params.appId) : this.deps.catalog.findByPrefixedToolName(params.prefixedToolName);
    if (!app) throw new Error('Unknown MCP App: provide a valid appId or prefixedToolName');
    const toolInput = { ...extractSchemaDefaults(app.inputSchema), ...(params.toolInput || {}) };
    let resolver;
    const toolResultPromise = params.bootstrapToolCall === false
      ? (params.toolCallId ? new Promise((resolve) => { resolver = resolve; }) : undefined)
      : this.invokeInitialTool(app, toolInput, params.sessionId).catch((error) => ({ content: [{ type: 'text', text: `MCP Apps initial tool call error: ${error.message}` }], isError: true }));
    const resolved = await this.deps.resolver.resolve(app);
    const appInstanceId = randomUUID();
    const instance = { appInstanceId, appId: app.mcpAppId, serverId: app.serverId, toolName: app.toolName, prefixedToolName: app.prefixedToolName, sessionId: params.sessionId, toolCallId: params.toolCallId, appUrl: `http://127.0.0.1:${this.deps.getHttpPort()}/mcp-apps/${appInstanceId}/app.html`, preloadUrl: this.resolvePreloadUrl(), uiMetadata: resolved.uiMetadata, toolInput, toolResult: undefined, createdAt: Date.now(), html: resolved.html, toolResultPromise, toolResultResolver: resolver };
    this.instances.set(appInstanceId, instance);
    if (params.toolCallId) this.toolCallIdToInstanceId.set(params.toolCallId, appInstanceId);
    if (toolResultPromise) toolResultPromise.then((result) => { if (this.instances.get(appInstanceId) === instance) instance.toolResult = result; });
    return this.toOpenHostAppResult(instance);
  }

  async awaitBootstrapToolResult(id) { const instance = this.instances.get(id); if (!instance) throw new Error(`Unknown MCP App instance: ${id}`); return instance.toolResultPromise; }
  closeInstance(id) { const instance = this.instances.get(id); if (instance) { this.dropInstance(id); this.deps.resolver.invalidate(instance.appId); } }
  async refreshToolResult(id, input) { const instance = this.instances.get(id); if (!instance) throw new Error(`Unknown MCP App instance: ${id}`); const app = this.deps.catalog.findById(instance.appId); const result = await this.invokeInitialTool(app, input ?? instance.toolInput, instance.sessionId); instance.toolInput = input ?? instance.toolInput; instance.toolResult = result; return result; }
  async proxyAppToolCall(id, name, args) { const instance = this.instances.get(id); if (!instance) throw new Error(`Unknown MCP App instance: ${id}`); const routed = this.routeAppToolName(instance, name); return this.deps.proxy.callTool(routed, args ?? {}, instance.sessionId ? { workbuddySessionId: instance.sessionId } : undefined); }
  async proxyAppResourceRead(id, uri) { const instance = this.instances.get(id); if (!instance) throw new Error(`Unknown MCP App instance: ${id}`); return this.deps.proxy.readResourceForTool(instance.prefixedToolName, uri); }
  routeAppToolName(instance, name) { const prefix = instance.prefixedToolName.endsWith(instance.toolName) ? instance.prefixedToolName.slice(0, -instance.toolName.length) : ''; return prefix && !name.startsWith(prefix) ? prefix + name : name; }
  getToken(id) { if (!this.instances.has(id)) throw new Error(`Unknown MCP App instance: ${id}`); return this.deps.ardotAuthService.connectorOauthAccessToken().then((response) => ({ accessToken: response.data.access_token, expireAt: secondsToMs(response.data.expire_at) })); }
  onOpenHostRequested(listener) { this.openHostRequestedListeners.add(listener); return () => this.openHostRequestedListeners.delete(listener); }
  recordModelContextUpdate(id, update) { const instance = this.instances.get(id); if (!instance) return false; instance.lastModelContextUpdate = { timestamp: Date.now(), ...update }; return true; }
  getModelContextUpdate(id) { return this.instances.get(id)?.lastModelContextUpdate; }
  pushToolResult(key, result) { const id = key.appInstanceId || this.toolCallIdToInstanceId.get(key.toolCallId); const instance = id && this.instances.get(id); if (!instance?.toolResultResolver) { if (key.toolCallId) this.pendingToolResults.set(key.toolCallId, result); return false; } const resolve = instance.toolResultResolver; instance.toolResultResolver = undefined; instance.toolResult = result; resolve(result); return true; }
  async handleAgentToolCall(params) { if (!params.toolCallId || !params.prefixedToolName) return { handled: false }; const app = this.deps.catalog.findByPrefixedToolName(params.prefixedToolName); if (!app) return { handled: false }; const descriptor = await this.openHostApp({ prefixedToolName: app.prefixedToolName, sessionId: params.sessionId, toolCallId: params.toolCallId, toolInput: params.rawInput, bootstrapToolCall: false }); for (const listener of this.openHostRequestedListeners) listener({ ...descriptor, toolCallId: params.toolCallId, sessionId: params.sessionId }); return { handled: true, appInstanceId: descriptor.appInstanceId, descriptor }; }
  resolvePreloadUrl() { if (this.cachedPreloadUrl !== undefined) return this.cachedPreloadUrl || undefined; const file = this.deps.getPreloadUrl?.() || this.deps.resolveBundledAsset?.('mcp-app-preload.js'); this.cachedPreloadUrl = file ? (file.startsWith('file:') ? file : pathToFileURL(file).toString()) : null; return this.cachedPreloadUrl || undefined; }
  async invokeInitialTool(app, input, sessionId) { const result = await this.deps.proxy.callTool(app.prefixedToolName, input ?? {}, sessionId ? { workbuddySessionId: sessionId } : undefined); return result && typeof result === 'object' ? result : { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] }; }
  toOpenHostAppResult(instance) { const { html, toolResultPromise, toolResultResolver, ...result } = instance; return result; }
}

module.exports = Object.freeze({ resolveSchemaProperties, extractSchemaDefaults, normalizeFileId, secondsToMs, AppGatewayService });
