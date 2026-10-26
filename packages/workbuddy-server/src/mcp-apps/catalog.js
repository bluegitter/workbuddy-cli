'use strict';
function extractToolUiMetadata(tool) { const meta = tool?._meta; if (!meta || typeof meta !== 'object') return undefined; const ui = meta.ui; if (ui && typeof ui === 'object' && typeof ui.resourceUri === 'string') return { resourceUri: ui.resourceUri, visibility: Array.isArray(ui.visibility) ? ui.visibility.filter((value) => value === 'model' || value === 'app') : undefined }; const resourceUri = meta['ui/resourceUri']; return typeof resourceUri === 'string' && resourceUri ? { resourceUri } : undefined; }
function normalizeServerId(configId) { if (!configId) return 'unknown'; const index = configId.indexOf(':'); return index >= 0 ? configId.slice(index + 1) : configId; }
class McpAppCatalog {
  constructor(deps) { this.deps = deps; this.byAppId = new Map(); this.byPrefixedToolName = new Map(); this.listeners = new Set(); }
  start() { this.refresh(); this.disposeToolsListener = this.deps.proxy.onToolsChanged(() => this.refresh()); }
  stop() { this.byAppId.clear(); this.byPrefixedToolName.clear(); this.listeners.clear(); this.disposeToolsListener?.(); this.disposeToolsListener = undefined; }
  refresh() { const apps = new Map(); const byName = new Map(); for (const tool of this.deps.proxy.listAllTools()) { const metadata = extractToolUiMetadata(tool); if (!metadata?.resourceUri) continue; const configId = this.deps.resolveConfigId(tool.name); const serverId = normalizeServerId(configId); const originalName = configId ? this.deps.resolveOriginalToolName(tool.name, configId) ?? tool.name : tool.name; const appId = `${serverId}/${originalName}`; apps.set(appId, { mcpAppId: appId, mcpAppName: appId, serverId, prefixedToolName: tool.name, toolName: originalName, resourceUri: metadata.resourceUri, description: tool.description, visibility: metadata.visibility?.length ? metadata.visibility : ['model', 'app'], inputSchema: tool.inputSchema }); byName.set(tool.name, appId); } const changed = !this.sameApps(apps); this.byAppId = apps; this.byPrefixedToolName = byName; if (changed) for (const listener of this.listeners) try { listener(this.listApps()); } catch {} }
  listApps() { return [...this.byAppId.values()]; }
  findById(id) { return this.byAppId.get(id); }
  findByPrefixedToolName(name) { const id = this.byPrefixedToolName.get(name); return id ? this.byAppId.get(id) : undefined; }
  onChanged(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  sameApps(next) { if (next.size !== this.byAppId.size) return false; for (const [id, value] of next) { const old = this.byAppId.get(id); if (!old || old.resourceUri !== value.resourceUri || old.prefixedToolName !== value.prefixedToolName || old.toolName !== value.toolName || old.description !== value.description) return false; } return true; }
}
module.exports = Object.freeze({ extractToolUiMetadata, normalizeServerId, McpAppCatalog });
