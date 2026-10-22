'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class SidecarManager extends EventEmitter {
  constructor({ command, args = [], cwd, env } = {}) {
    super(); this.command = command; this.args = args; this.cwd = cwd; this.env = env; this.processes = new Map();
  }

  start(sessionId, extraArgs = []) {
    if (this.processes.has(sessionId)) throw new Error(`sidecar already running: ${sessionId}`);
    const child = spawn(this.command, [...this.args, ...extraArgs], { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => this.emit('stdout', sessionId, data));
    child.stderr.on('data', (data) => this.emit('stderr', sessionId, data));
    child.once('exit', (code, signal) => { this.processes.delete(sessionId); this.emit('exit', sessionId, { code, signal }); });
    this.processes.set(sessionId, child);
    return child;
  }

  stop(sessionId, signal = 'SIGTERM') { const child = this.processes.get(sessionId); if (!child) return false; child.kill(signal); return true; }
  stopAll() { for (const id of this.processes.keys()) this.stop(id); }
}

module.exports = { SidecarManager };
