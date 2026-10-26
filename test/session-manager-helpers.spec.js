'use strict';

const assert = require('node:assert');
const meta = require('../packages/workbuddy-server/src/session/session-manager-meta');
const identity = require('../packages/workbuddy-server/src/session/session-runtime-identity');
const history = require('../packages/workbuddy-server/src/session/session-history-events');
const team = require('../packages/workbuddy-server/src/session/session-team-runtime');
const prompt = require('../packages/workbuddy-server/src/session/session-prompt-errors');
const queue = require('../packages/workbuddy-server/src/session/message-queue-restart');

assert.strictEqual(meta.readSessionSourceMode({ 'codebuddy.ai': { sourceMode: '  claw  ' } }), 'claw');
assert.strictEqual(meta.readSessionSourceMode({ 'codebuddy.ai': { welcomeMode: 'welcome' } }), 'welcome');
assert.strictEqual(meta.normalizeCwdPath('/tmp/work///'), '/tmp/work');
assert.strictEqual(meta.isCancelledStopReason(' CANCELED '), true);
assert.deepStrictEqual(meta.withPersistedSessionMeta(undefined, { sourceMode: 'cli' }), { 'codebuddy.ai': { sourceMode: 'cli' } });

assert.strictEqual(identity.normalizeBackendPermissionMode('unknown'), 'bypassPermissions');
assert.strictEqual(identity.isSameSessionRuntimeConfig({ model: 'a', systemPrompt: 'x' }, { model: 'a', systemPrompt: 'x' }), true);
assert.strictEqual(identity.resolveRuntimeReclaimIdleTimeoutMs(0), Infinity);
assert.strictEqual(identity.deriveToolsFromDisabled('craft', ['Read']).split(',').includes('Read'), false);

const event = { update: { sessionUpdate: 'user_message_chunk' }, _meta: { 'codebuddy.ai': { messageId: 'm1', offset: '12', mode: 'stream' } } };
assert.strictEqual(history.getOwnerHistoryUserMessageId(event), 'm1');
assert.strictEqual(history.getOwnerHistoryOffset(event), 12);
assert.strictEqual(history.getOwnerHistoryMode(event), 'stream');
assert.strictEqual(history.extractTextFromContentBlocks([{ type: 'text', text: 'a' }, { type: 'image' }]), 'a');
assert.strictEqual(history.isCompactInternalEventPayload({ _meta: { 'codebuddy.ai': { isSessionSeparator: true } } }), true);

assert.deepStrictEqual(team.extractTeamUpdate({ _meta: { 'codebuddy.ai/teamUpdate': { type: 'team_idle', teamName: 't' } } }), { type: 'team_idle', teamName: 't', isAutoTeam: undefined, members: undefined });
assert.strictEqual(team.isActiveToolResultStatus('in_progress'), true);
assert.strictEqual(team.deriveTerminalExportStatus({ terminalOutcome: 'failed' }), 'failed');

const failure = prompt.createPromptFailureStateUpdate({ sessionId: 's1', taskState: { terminalOutcome: null }, stopRequested: false }, { 'codebuddy.ai/requestId': 'r1' }, Object.assign(new Error('boom'), { code: 'E_FAIL', data: { reason: 'x' } }));
assert.strictEqual(failure.update.currentState, 'error');
assert.strictEqual(failure._meta['codebuddy.ai'].error.requestId, 'r1');
assert.strictEqual(prompt.isCompactFailedError({ code: -32004, data: { reason: 'compact_failed' } }), true);

const restored = queue.normalizeQueueForRestart({ version: 2, items: [{ order: 9, status: 'sent' }, { order: 4, status: 'sending' }, { order: 2, status: 'pending' }], runtime: { paused: true, pauseReason: 'error', lastError: 'x' } }, 's1');
assert.deepStrictEqual(restored.items.map((item) => [item.order, item.status]), [[0, 'pending'], [1, 'pending']]);
assert.strictEqual(restored.runtime.paused, true);
assert.strictEqual(queue.normalizeQueueForRestart({ items: [] }, 's1'), undefined);

console.log('session manager helper tests passed');
