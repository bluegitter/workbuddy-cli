'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

function main() {
  const routed = app.routeSessionInfoUpdate({ update: { title: 'x', _meta: { 'codebuddy.ai/historyReplay': 'start', 'codebuddy.ai/agentPhase': { phase: 'working' } } }, _meta: {} });
  assert.strictEqual(routed.boundary.kind, 'history_replay');
  assert.strictEqual(routed.agentPhase.phase, 'working');
  const events = [];
  const coordinator = new app.ACPToolCallUpdateCoordinator({ hasAccumulatedToolCall: () => false, getMappedMessageId: () => undefined, applyStandaloneUpdate: () => {}, applyAccumulatedUpdate: () => {} });
  coordinator.handleAssistantUpdate({ sessionId: 's', update: { toolCallId: 't' } });
  assert.strictEqual(coordinator.getBufferedUpdates().get('s').get('t').length, 1);
  assert.strictEqual(app.classifyTranscriptEvent({ update: { sessionUpdate: 'user_message_chunk' } }, () => ({})).kind, 'user_message_chunk');
  assert.strictEqual(app.isCompactUserPrompt([{ type: 'text', text: '<compact-request>summary' }]), true);
  assert.strictEqual(app.classifyCompactFrame({ content: [{ type: 'text', text: '<summary>done</summary>' }] }), 'completed');
  void events;
  console.log('workbuddy app ACP routing tests passed');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
