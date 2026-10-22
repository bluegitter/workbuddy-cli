'use strict';

const { EventEmitter } = require('events');
const { RingBuffer } = require('./ring-buffer');
const { createChildProcessSession } = require('./session-process');

class SidecarSessionManager extends EventEmitter {
  constructor({ command, args = [], cwd, env, processFactory = createChildProcessSession, bufferCapacity } = {}) {
    super();
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.processFactory = processFactory;
    this.bufferCapacity = bufferCapacity;
    this.sessions = new Map();
  }

  start(sessionId, options = {}) {
    if (!sessionId) throw new TypeError('session id is required');
    if (this.sessions.has(sessionId)) throw new Error(`sidecar session already exists: ${sessionId}`);
    const processHandle = this.processFactory({
      command: options.command || this.command,
      args: [...(options.args || this.args), ...(options.extraArgs || [])],
      cwd: options.cwd || this.cwd,
      env: options.env || this.env,
      cols: options.cols,
      rows: options.rows,
    });
    const session = { id: sessionId, process: processHandle, output: new RingBuffer(this.bufferCapacity), startedAt: Date.now(), exited: false };
    this.sessions.set(sessionId, session);
    processHandle.onData((chunk) => { session.output.write(chunk); this.emit('data', sessionId, chunk); });
    processHandle.onExit((event) => {
      session.exited = true;
      this.sessions.delete(sessionId);
      this.emit('exit', sessionId, event);
    });
    this.emit('start', sessionId, { pid: processHandle.pid, startedAt: session.startedAt });
    return session;
  }

  get(sessionId) { return this.sessions.get(sessionId); }
  list() { return [...this.sessions.values()].map((session) => ({ id: session.id, pid: session.process.pid, startedAt: session.startedAt, exited: session.exited })); }
  write(sessionId, data) { const session = this.sessions.get(sessionId); if (!session) return false; session.process.write(data); return true; }
  resize(sessionId, cols, rows) { const session = this.sessions.get(sessionId); if (!session) return false; session.process.resize(cols, rows); return true; }
  capture(sessionId) { const session = this.sessions.get(sessionId); return session ? session.output.snapshot() : undefined; }
  stop(sessionId, signal = 'SIGTERM') { const session = this.sessions.get(sessionId); if (!session) return false; session.process.kill(signal); return true; }
  stopAll(signal = 'SIGTERM') { for (const session of this.sessions.values()) session.process.kill(signal); }
}

module.exports = { SidecarSessionManager };
