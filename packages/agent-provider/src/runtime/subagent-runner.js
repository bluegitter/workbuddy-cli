'use strict';

const { HookEvent } = require('./hook-registry');
const { runAgentLoop } = require('./agent-loop');

class SubagentRunner {
  constructor({ sessions, runtimeFactory, hooks } = {}) {
    this.sessions = sessions;
    this.runtimeFactory = runtimeFactory;
    this.hooks = hooks;
  }

  async run(parent, definition, prompt) {
    const child = this.sessions.create({
      messages: [{ type: 'user', role: 'user', content: prompt }],
      project: parent.project,
      permissionMode: definition.permissionMode || parent.permissionMode,
    });
    child.parentSessionId = parent.id;
    child.agentType = definition.name || definition.agentType || 'general-purpose';
    const abortChild = () => child.abort('parent cancelled');
    parent.abortController.signal.addEventListener('abort', abortChild, { once: true });
    await this.hooks?.run(HookEvent.SUBAGENT_START, { parent, child, definition });
    try {
      const result = await runAgentLoop(child, await this.runtimeFactory({ parent, child, definition }));
      await this.hooks?.run(HookEvent.SUBAGENT_STOP, { parent, child, definition, result });
      return { session: child, result };
    } finally {
      parent.abortController.signal.removeEventListener('abort', abortChild);
    }
  }
}

module.exports = { SubagentRunner };
