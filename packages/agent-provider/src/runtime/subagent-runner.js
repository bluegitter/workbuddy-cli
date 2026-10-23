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
      parentSessionId: parent.id,
      agentType: definition.agentType || definition.name || 'general-purpose',
    });
    const abortChild = () => child.abort('parent cancelled');
    parent.abortController.signal.addEventListener('abort', abortChild, { once: true });
    const startHook = await this.hooks?.run(HookEvent.SUBAGENT_START, { parent, child, definition });
    if (startHook?.stopped) {
      child.abort(startHook.reason);
      return { session: child, result: undefined, stopped: true, reason: startHook.reason };
    }
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
