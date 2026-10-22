'use strict';

class AgentViewModel {
  constructor(session) {
    this.session = session;
    this.messages = [];
    this.pendingTools = new Map();
    this.status = 'idle';
  }

  apply(event) {
    if (!event) return;
    if (event.type === 'assistant' || event.type === 'user' || event.type === 'tool_result') this.messages.push(event);
    if (event.type === 'tool_start') this.pendingTools.set(event.toolUseId, event);
    if (event.type === 'tool_result') this.pendingTools.delete(event.toolUseId);
    if (event.status) this.status = event.status;
  }

  snapshot() {
    return { session: this.session, messages: [...this.messages], pendingTools: [...this.pendingTools.values()], status: this.status };
  }
}

module.exports = { AgentViewModel };
