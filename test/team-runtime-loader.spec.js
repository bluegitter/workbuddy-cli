'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configureWorkbuddyRuntimeContext } = require('../packages/runtime/src/runtime/runtime-context');
const loader = require('../packages/workbuddy-server/src/session/team-runtime-loader');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-team-loader-'));
  try {
    configureWorkbuddyRuntimeContext({ configDir: root });
    assert.strictEqual(loader.compressWorkspacePath('/Users/test/project'), 'Users-test-project');
    assert.deepStrictEqual(loader.parseToRecord('{"value":1}', 'raw'), { value: 1 });
    assert.deepStrictEqual(loader.parseToRecord('plain', 'raw'), { raw: 'plain' });
    assert.strictEqual(loader.stripSystemTags('<system-reminder>x</system-reminder><user_query> Build </user_query>'), 'Build');

    const replayEvents = [
      { _meta: { 'codebuddy.ai/teamUpdate': { type: 'team_created', teamName: 'alpha', isAutoTeam: true } } },
      { update: { sessionUpdate: 'tool_call', toolCallId: 'spawn-1', toolName: 'Agent', rawInput: { name: 'worker', description: 'Do work', team_name: 'alpha' } } },
      { update: { sessionUpdate: 'tool_call_update', toolCallId: 'spawn-1', rawOutput: { task_id: 'task-1', team_name: 'alpha' } } },
      { update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: '<teammate-message teammate_id="worker" summary="Done">Result</teammate-message>' } } },
    ];
    const snapshot = loader.buildFallbackSnapshot('session-1', replayEvents);
    assert.strictEqual(snapshot.isInTeam, true);
    assert.strictEqual(snapshot.teamName, 'alpha');
    assert.strictEqual(snapshot.members[0].name, 'worker');
    assert.strictEqual(snapshot.members[0].taskId, 'task-1');
    assert.strictEqual(snapshot.memberHistories.worker[0].content.text.includes('teammate-message'), true);

    const projects = path.join(root, 'projects', 'Users-test-project', 'session-1', 'subagents');
    fs.mkdirSync(projects, { recursive: true });
    fs.writeFileSync(path.join(projects, 'task-1.jsonl'), [
      JSON.stringify({ type: 'message', role: 'user', content: [{ type: 'input_text', text: '<user_query>Build</user_query>' }], timestamp: 1 }),
      JSON.stringify({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }], timestamp: 2 }),
      JSON.stringify({ type: 'function_call', id: 'call-1', name: 'Read', arguments: '{"file_path":"a"}', status: 'completed', timestamp: 3 }),
      JSON.stringify({ type: 'function_call_result', id: 'call-1', output: '{"ok":true}', status: 'completed', timestamp: 4 }),
    ].join('\n'));
    const loaded = await loader.loadSessionTeamRuntimeSnapshot({ sessionId: 'session-1', cwd: '/Users/test/project', eventHistory: replayEvents, isSessionActive: false });
    assert.strictEqual(loaded.members[0].status, 'completed');
    assert.strictEqual(loaded.memberHistories.worker.length >= 4, true);
    console.log('team runtime loader tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
