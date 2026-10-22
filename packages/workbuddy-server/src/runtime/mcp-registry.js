'use strict';

class McpRegistry {
  constructor() { this.servers = new Map(); }

  register(server) {
    if (!server?.name || typeof server.listTools !== 'function' || typeof server.callTool !== 'function') throw new TypeError('invalid MCP server');
    this.servers.set(server.name, server); return server;
  }

  unregister(name) { return this.servers.delete(name); }
  get(name) { return this.servers.get(name); }

  async listTools() {
    const tools = [];
    for (const server of this.servers.values()) for (const tool of await server.listTools()) tools.push({ ...tool, server: server.name });
    return tools;
  }

  async call(serverName, toolName, args, context) {
    const server = this.servers.get(serverName); if (!server) throw new Error(`MCP server not found: ${serverName}`);
    return server.callTool(toolName, args, context);
  }
}

module.exports = { McpRegistry };
