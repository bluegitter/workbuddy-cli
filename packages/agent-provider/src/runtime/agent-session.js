'use strict';

const crypto = require('crypto');

class AgentSession {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.messages = [...(options.messages || [])];
    this.project = options.project;
    this.permissionMode = options.permissionMode || 'default';
    this.abortController = new AbortController();
    this.status = 'idle';
    this.turn = 0;
    this.createdAt = Date.now();
    this.metadata = { ...(options.metadata || {}) };
  }

  append(message) {
    this.messages.push(message);
    return message;
  }

  abort(reason = 'cancelled') {
    this.status = 'cancelled';
    this.abortController.abort(reason);
  }
}

module.exports = { AgentSession };
