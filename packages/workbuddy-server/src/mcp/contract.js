'use strict';

const MCP_RPC_CHANNELS = Object.freeze({
  LIST: 'mcp:list',
  TOGGLE: 'mcp:toggle',
  RECONNECT: 'mcp:reconnect',
  DELETE: 'mcp:delete',
  TOGGLE_TOOL: 'mcp:toggleTool',
  OPEN_CONFIG: 'mcp:openConfig',
  GET_CONFIG_CONTENT: 'mcp:getConfigContent',
  SAVE_CONFIG_CONTENT: 'mcp:saveConfigContent',
});

module.exports = { MCP_RPC_CHANNELS };
