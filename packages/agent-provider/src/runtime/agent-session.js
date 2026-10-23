'use strict';

const crypto = require('crypto');
const { createAgentIdentity } = require('./session-lineage');

class AgentSession {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    Object.assign(this, createAgentIdentity({ sessionId: this.id, parentSessionId: options.parentSessionId, agentId: options.agentId, agentType: options.agentType }));
    this.messages = [...(options.messages || [])];
    this.project = options.project;
    this.permissionMode = options.permissionMode || 'default';
    this.abortController = new AbortController();
    this.status = 'idle';
    this.turn = 0;
    this.createdAt = Date.now();
    this.metadata = { ...(options.metadata || {}) };
    this.children = new Set();
  }

  append(message) {
    this.messages.push(message);
    return message;
  }

  abort(reason = 'cancelled') {
    this.status = 'cancelled';
    this.abortController.abort(reason);
  }

  addChild(sessionId) { this.children.add(sessionId); }
  removeChild(sessionId) { this.children.delete(sessionId); }
}

module.exports = { AgentSession };
