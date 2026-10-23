'use strict';

const { AgentSession } = require('./agent-session');
const { buildSessionLineage } = require('./session-lineage');

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(options = {}) {
    const session = new AgentSession(options);
    this.sessions.set(session.id, session);
    if (session.parentSessionId) this.sessions.get(session.parentSessionId)?.addChild(session.id);
    return session;
  }

  get(id) {
    return this.sessions.get(id);
  }

  close(id, reason) {
    const session = this.sessions.get(id);
    if (!session) return false;
    for (const child of this.childrenOf(id)) this.close(child.id, reason || 'parent session closed');
    if (!['completed', 'failed', 'cancelled'].includes(session.status)) session.abort(reason);
    this.sessions.delete(id);
    if (session.parentSessionId) this.sessions.get(session.parentSessionId)?.removeChild(id);
    return true;
  }

  childrenOf(id) { return [...(this.sessions.get(id)?.children || [])].map((childId) => this.sessions.get(childId)).filter(Boolean); }
  lineageOf(id) { const session = this.get(id); return session ? buildSessionLineage(session, this.sessions) : []; }

  abortTree(id, reason = 'session cancelled') {
    const session = this.get(id);
    if (!session) return false;
    for (const child of this.childrenOf(id)) this.abortTree(child.id, reason);
    session.abort(reason);
    return true;
  }
}

module.exports = { SessionManager };
