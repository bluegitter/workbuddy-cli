'use strict';

function configPriority(configId) {
  if (configId.startsWith('connector:')) return 100;
  if (configId.startsWith('plugin-mcp:')) return 50;
  if (configId.startsWith('custom-mcp:')) return 10;
  return 0;
}

function extractServerShortName(configId) {
  return String(configId).replace(/^(connector|plugin-mcp|custom-mcp|project-mcp):/, '');
}

class ToolRoutingTable {
  constructor({ clients = new Map(), builtinTools = new Map(), disabledTools = new Map() } = {}) {
    this.clients = clients;
    this.builtinTools = builtinTools;
    this.disabledTools = disabledTools;
    this.routes = new Map();
  }

  upsert(toolName, configId) {
    const candidates = (this.routes.get(toolName) || []).filter((candidate) => candidate.configId !== configId);
    candidates.push({ configId, priority: configPriority(configId) });
    candidates.sort((left, right) => right.priority - left.priority);
    this.routes.set(toolName, candidates);
  }

  remove(toolName, configId) {
    const next = (this.routes.get(toolName) || []).filter((candidate) => candidate.configId !== configId);
    if (next.length) this.routes.set(toolName, next); else this.routes.delete(toolName);
  }

  resolve(toolName) {
    const candidates = this.routes.get(toolName) || [];
    return candidates.find((candidate) => this.clients.get(candidate.configId)?.status === 'connected')?.configId || candidates[0]?.configId;
  }

  primaryClients() {
    const buckets = new Map();
    for (const [configId, entry] of this.clients) {
      if (entry.status !== 'connected') continue;
      const shortName = extractServerShortName(configId);
      const candidates = buckets.get(shortName) || [];
      candidates.push({ configId, entry, priority: configPriority(configId) });
      buckets.set(shortName, candidates);
    }
    for (const candidates of buckets.values()) candidates.sort((left, right) => right.priority - left.priority);
    return buckets;
  }

  listTools({ projectId, welcomeMode } = {}) {
    const visible = new Map();
    for (const [serverName, candidates] of this.primaryClients()) {
      const selected = candidates[0];
      if (welcomeMode !== undefined && welcomeMode !== 'design' && serverName === 'ardot') continue;
      if (selected.configId.startsWith('project-mcp:') && !projectId) continue;
      if (serverName === 'netdrive' && !projectId) continue;
      const disabled = new Set(this.disabledTools.get(selected.configId) || []);
      for (const tool of selected.entry.tools || []) {
        if (disabled.has(tool.name) || visible.has(tool.name)) continue;
        visible.set(tool.name, { ...tool, _meta: { ...(tool._meta || {}), serverName } });
      }
    }
    for (const tool of this.builtinTools.values()) if (!visible.has(tool.name)) visible.set(tool.name, { name: tool.name, description: tool.description, inputSchema: tool.inputSchema, ...(tool._meta ? { _meta: tool._meta } : {}) });
    return [...visible.values()];
  }

  toolServerMap(options) { return Object.fromEntries(this.listTools(options).filter((tool) => tool._meta?.serverName).map((tool) => [tool.name, tool._meta.serverName])); }
}

module.exports = { ToolRoutingTable, configPriority, extractServerShortName };
