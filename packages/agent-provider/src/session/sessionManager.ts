declare const require: (moduleName: string) => any;

interface ManagedSession {
  id: string;
  parentSessionId?: string;
  children?: Set<string>;
  status: string;
  abort(reason?: unknown): void;
  addChild?(id: string): void;
  removeChild?(id: string): void;
}

interface SessionOptions {
  [key: string]: unknown;
}

const { AgentSession } = require('../runtime/agent-session');
const { buildSessionLineage } = require('../runtime/session-lineage');

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  create(options: SessionOptions = {}): ManagedSession {
    const session = new AgentSession(options) as ManagedSession;
    this.sessions.set(session.id, session);
    if (session.parentSessionId) this.sessions.get(session.parentSessionId)?.addChild?.(session.id);
    return session;
  }

  get(id: string): ManagedSession | undefined {
    return this.sessions.get(id);
  }

  close(id: string, reason?: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    for (const child of this.childrenOf(id)) this.close(child.id, reason || 'parent session closed');
    if (!['completed', 'failed', 'cancelled'].includes(session.status)) session.abort(reason);
    this.sessions.delete(id);
    if (session.parentSessionId) this.sessions.get(session.parentSessionId)?.removeChild?.(id);
    return true;
  }

  childrenOf(id: string): ManagedSession[] {
    return [...(this.sessions.get(id)?.children || [])]
      .map((childId) => this.sessions.get(childId))
      .filter((session): session is ManagedSession => Boolean(session));
  }

  lineageOf(id: string): ManagedSession[] {
    const session = this.get(id);
    return session ? buildSessionLineage(session, this.sessions) : [];
  }

  abortTree(id: string, reason = 'session cancelled'): boolean {
    const session = this.get(id);
    if (!session) return false;
    for (const child of this.childrenOf(id)) this.abortTree(child.id, reason);
    session.abort(reason);
    return true;
  }
}
