'use strict';

const { AgentSession } = require('./agent-session');

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(options = {}) {
    const session = new AgentSession(options);
    this.sessions.set(session.id, session);
    return session;
  }

  get(id) {
    return this.sessions.get(id);
  }

  close(id, reason) {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (!['completed', 'failed', 'cancelled'].includes(session.status)) session.abort(reason);
    this.sessions.delete(id);
    return true;
  }
}

module.exports = { SessionManager };
