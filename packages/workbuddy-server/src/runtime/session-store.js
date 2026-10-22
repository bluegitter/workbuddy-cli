'use strict';

const { EventEmitter } = require('events');

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

class SessionStore extends EventEmitter {
  constructor({ clock = () => Date.now() } = {}) {
    super(); this.clock = clock; this.sessions = new Map(); this.tasks = new Map();
  }

  createSession(input = {}) {
    if (!input.id) throw new TypeError('session id is required');
    const session = { id: input.id, projectId: input.projectId, status: 'active', createdAt: this.clock(), updatedAt: this.clock(), metadata: { ...(input.metadata || {}) } };
    this.sessions.set(session.id, session); this.emit('session.created', session); return { ...session };
  }

  getSession(id) { const session = this.sessions.get(id); return session && { ...session, metadata: { ...session.metadata } }; }

  updateSession(id, patch) {
    const current = this.sessions.get(id); if (!current) throw new Error(`session not found: ${id}`);
    const next = { ...current, ...patch, id, updatedAt: this.clock() }; this.sessions.set(id, next); this.emit('session.updated', next); return { ...next };
  }

  createTask(input = {}) {
    if (!input.id || !input.sessionId) throw new TypeError('task id and session id are required');
    if (!this.sessions.has(input.sessionId)) throw new Error(`session not found: ${input.sessionId}`);
    const task = { id: input.id, sessionId: input.sessionId, status: 'pending', createdAt: this.clock(), updatedAt: this.clock(), result: undefined, error: undefined };
    this.tasks.set(task.id, task); this.emit('task.created', task); return { ...task };
  }

  updateTask(id, patch) {
    const current = this.tasks.get(id); if (!current) throw new Error(`task not found: ${id}`);
    if (TERMINAL.has(current.status) && patch.status && patch.status !== current.status) throw new Error(`task is terminal: ${id}`);
    const next = { ...current, ...patch, id, updatedAt: this.clock() }; this.tasks.set(id, next); this.emit('task.updated', next); return { ...next };
  }

  listTasks(sessionId) { return [...this.tasks.values()].filter((task) => !sessionId || task.sessionId === sessionId).map((task) => ({ ...task })); }
}

module.exports = { SessionStore, TERMINAL_TASK_STATUSES: TERMINAL };
