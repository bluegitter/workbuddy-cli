'use strict';

const { planConnectorSync } = require('./connector-sync');
const { createConnectingEntry, snapshotClientEntry, createToolEntry } = require('./connector-client-state');
const { ToolRoutingTable } = require('./tool-routing');

/**
 * Injectable MCP client pool extracted from ConnectorMcpProxy.
 * SDK clients and transport construction are supplied by the host; this
 * class owns lifecycle state, in-flight de-duplication and tool snapshots.
 */
class ConnectorMcpClientPool {
  constructor(options = {}) {
    this.createClient = options.createClient || (() => { throw new Error('createClient is unavailable'); });
    this.connectClient = options.connectClient || (async () => {});
    this.listClientTools = options.listClientTools || (async (client) => client.listTools?.() || { tools: [] });
    this.closeClient = options.closeClient || (async (client) => client.close?.());
    this.logger = options.logger || { info() {}, warn() {} };
    this.onToolsChanged = options.onToolsChanged || (() => {});
    this.builtinTools = options.builtinTools || new Map();
    this.getDisabledTools = options.getDisabledTools || (() => []);
    this.clients = new Map();
    this.activeConfigs = new Map();
    this.inFlightConnects = new Map();
  }

  async connect(configId, serverConfig, options = {}) {
    const pending = this.inFlightConnects.get(configId);
    if (pending) return pending;
    const existing = this.clients.get(configId);
    const previous = this.activeConfigs.get(configId);
    if (!options.force && existing?.status === 'connected' && previous && sameConfig(previous, serverConfig)) {
      existing.serverConfig = { ...serverConfig };
      this.activeConfigs.set(configId, { ...serverConfig });
      return { success: true, cached: true };
    }
    const operation = this.doConnect(configId, serverConfig, options);
    this.inFlightConnects.set(configId, operation);
    try { return await operation; }
    finally { this.inFlightConnects.delete(configId); }
  }

  async doConnect(configId, serverConfig, options) {
    if (this.clients.has(configId)) await this.disconnect(configId, 'reconnect');
    const client = this.createClient(configId, serverConfig);
    const entry = createConnectingEntry(configId, client, serverConfig);
    this.clients.set(configId, entry);
    this.activeConfigs.set(configId, { ...serverConfig });
    try {
      await this.connectClient(client, serverConfig, { configId, ...options });
      const listed = await this.listClientTools(client, { configId, serverConfig });
      entry.tools = (listed?.tools || []).map((tool) => createToolEntry(configId, tool));
      entry.prompts = listed?.prompts;
      entry.resources = listed?.resources;
      entry.resourceTemplates = listed?.resourceTemplates;
      entry.status = 'connected';
      entry.error = undefined;
      this.onToolsChanged();
      return { success: true, tools: entry.tools };
    } catch (error) {
      entry.status = 'error';
      entry.error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[ConnectorMcpClientPool] connect(${configId}) failed: ${entry.error}`);
      return { success: false, error: entry.error };
    }
  }

  async disconnect(configId, reason = 'unknown') {
    const entry = this.clients.get(configId);
    if (!entry) return { success: true, noop: true };
    this.clients.delete(configId);
    this.activeConfigs.delete(configId);
    try { await this.closeClient(entry.client, { configId, reason }); }
    catch (error) { this.logger.warn(`[ConnectorMcpClientPool] disconnect(${configId}) failed: ${error?.message ?? error}`); }
    this.onToolsChanged();
    return { success: true };
  }

  async sync(desiredConfigs = {}) {
    const plan = planConnectorSync(this.activeConfigs, desiredConfigs, sameConfig);
    const result = { added: [], removed: [], reconnected: [], failed: [] };
    for (const id of plan.removed) { await this.disconnect(id, 'sync_removed'); result.removed.push(id); }
    for (const { id, config } of [...plan.reconnect, ...plan.added]) {
      if (plan.reconnect.some((item) => item.id === id)) await this.disconnect(id, 'config_changed');
      const connected = await this.connect(id, config, { silent: true });
      if (!connected.success) result.failed.push(id);
      else if (plan.reconnect.some((item) => item.id === id)) result.reconnected.push(id);
      else result.added.push(id);
    }
    for (const { id, config } of plan.unchanged) this.activeConfigs.set(id, { ...config });
    return result;
  }

  getClientEntry(configId) { return snapshotClientEntry(this.clients.get(configId)); }
  getAllClientEntries() { return new Map([...this.clients].map(([id, entry]) => [id, snapshotClientEntry(entry)])); }
  listAllTools(options = {}) {
    const disabledTools = new Map([...this.clients.keys()].map((id) => [id, this.getDisabledTools(id)]));
    return new ToolRoutingTable({ clients: this.clients, builtinTools: this.builtinTools, disabledTools }).listTools(options);
  }

  getToolServerMap(options) {
    const disabledTools = new Map([...this.clients.keys()].map((id) => [id, this.getDisabledTools(id)]));
    return new ToolRoutingTable({ clients: this.clients, builtinTools: this.builtinTools, disabledTools }).toolServerMap(options);
  }

  registerBuiltinTool(tool) { this.builtinTools.set(tool.name, tool); this.onToolsChanged(); }
  unregisterBuiltinTool(name) { const removed = this.builtinTools.delete(name); if (removed) this.onToolsChanged(); return removed; }

  resolveToolConfigId(toolName, options) {
    const routing = new ToolRoutingTable({ clients: this.clients, builtinTools: this.builtinTools, disabledTools: new Map([...this.clients.keys()].map((id) => [id, this.getDisabledTools(id)])) });
    const explicit = routing.resolve(toolName, options);
    if (explicit) return explicit;
    for (const candidates of routing.primaryClients().values()) {
      const selection = candidates[0];
      if (!selection) continue;
      if (selection.entry.tools?.some((tool) => tool.name === toolName)) return selection.configId;
    }
    return undefined;
  }

  async callTool(toolName, args = {}, context = {}, onProgress) {
    const builtin = this.builtinTools.get(toolName);
    if (builtin) return builtin.handler(args, context);
    const configId = this.resolveToolConfigId(toolName, context);
    if (!configId) throw new Error(`Tool "${toolName}" not found in any connected connector`);
    if (new Set(this.getDisabledTools(configId) || []).has(toolName)) throw new Error(`Tool "${toolName}" is disabled by user`);
    const entry = this.clients.get(configId);
    if (!entry || entry.status !== 'connected') throw new Error(`Connector "${configId}" is not connected`);
    const shortName = configId.replace(/^(connector|plugin-mcp|custom-mcp|project-mcp):/, '');
    const originalName = toolName.startsWith(`${shortName}_`) ? toolName.slice(shortName.length + 1) : toolName;
    if (typeof entry.client.callTool !== 'function') throw new Error(`Connector "${configId}" does not support tools/call`);
    return entry.client.callTool({ name: originalName, arguments: args }, { onProgress, ...context });
  }

  async readResourceForConnector(configId, uri) {
    const entry = this.clients.get(configId);
    if (!entry || entry.status !== 'connected') throw new Error(`Connector "${configId}" is not connected`);
    if (typeof entry.client.readResource !== 'function') throw new Error(`Connector "${configId}" does not support resources/read`);
    return entry.client.readResource({ uri });
  }
}

function sameConfig(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

module.exports = { ConnectorMcpClientPool, sameConfig };
