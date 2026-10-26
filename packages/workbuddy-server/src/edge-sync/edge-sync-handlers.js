'use strict';

const basic = require('../runtime/edge-sync-basic-handlers');
const { handleGetPage } = require('./edge-sync-jsonl');

const COMMAND_HANDLERS = Object.freeze({
  'session.create': basic.handleSessionCreate,
  'prompt.submit': basic.handlePromptSubmit,
  'session.stop': basic.handleSessionStop,
  'session.set_mode': basic.handleSessionSetMode,
  'session.get_mode': basic.handleSessionGetMode,
  'session.set_model': basic.handleSessionSetModel,
  'session.get_model': basic.handleSessionGetModel,
  'session.set_permission_mode': basic.handleSessionSetPermissionMode,
  'session.get_permission_mode': basic.handleSessionGetPermissionMode,
  'tool.answer': basic.handleToolAnswer,
  'tool.cancel': basic.handleToolCancel,
  'permission.resolve': basic.handlePermissionResolve,
  get_automations: basic.handleGetAutomations,
  get_task_artifacts: basic.handleGetTaskArtifacts,
  get_models: basic.handleGetModels,
  get_session_config: basic.handleGetSessionConfig,
  get_skills: basic.handleGetSkills,
  get_page: handleGetPage
});

function createEdgeSyncCommandHandlers(context, options = {}) {
  const handlers = new Map();
  for (const [type, handler] of Object.entries(COMMAND_HANDLERS)) handlers.set(type, (command) => handler(context, command, options));
  return handlers;
}

module.exports = Object.freeze({ ...basic, COMMAND_HANDLERS, createEdgeSyncCommandHandlers });
