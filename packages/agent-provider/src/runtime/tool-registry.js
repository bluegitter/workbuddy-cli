'use strict';

const { buildTool } = require('./tool-definition');

class ToolRegistry {
  constructor(tools = []) {
    this.tools = new Map();
    for (const tool of tools) this.register(tool);
  }

  register(tool) {
    const normalized = buildTool(tool);
    this.tools.set(normalized.name, normalized);
    return this;
  }

  get(name) {
    return this.tools.get(name);
  }

  list() {
    return [...this.tools.values()];
  }
}

module.exports = { ToolRegistry };
