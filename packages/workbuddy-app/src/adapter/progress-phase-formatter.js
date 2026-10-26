'use strict';

function formatPhaseType({ phase, toolName, streamingToolName, progress }) {
  if (phase === 'idle') return null;
  if (phase === 'tool_executing' && toolName) return `phase.tool_executing.${toolName}`;
  if (phase === 'model_streaming' && streamingToolName) return `phase.model_streaming.${streamingToolName}`;
  if (phase === 'waiting_for_permission' && toolName) return `phase.waiting_for_permission.${toolName}`;
  if (phase === 'waiting_for_user' && toolName) return `phase.waiting_for_user.${toolName}`;
  if (phase === 'finalization_file_projection_sync_notify' && progress) return `phase.finalization_file_projection_sync_notify.${progress.kind}.${progress.current}.${progress.total}`;
  return `phase.${phase}`;
}

module.exports = Object.freeze({ formatPhaseType });
