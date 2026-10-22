'use strict';

const { spawn } = require('child_process');

function signalNameToNumber(name) {
  return ({ SIGTERM: 15, SIGKILL: 9, SIGINT: 2, SIGHUP: 1 })[name];
}

function createChildProcessSession(options) {
  const child = spawn(options.command, options.args || [], {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const dataListeners = new Set();
  const exitListeners = new Set();
  let exited = false;
  let exitEvent;
  const emitData = (chunk) => {
    if (exited) return;
    for (const listener of dataListeners) {
      try { listener(Buffer.from(chunk)); } catch {}
    }
  };
  child.stdout.on('data', emitData);
  child.stderr.on('data', emitData);
  child.stdin.on('error', () => {});
  const finish = (event) => {
    if (exited) return;
    exited = true;
    exitEvent = event;
    for (const listener of exitListeners) {
      try { listener(event); } catch {}
    }
    dataListeners.clear();
    exitListeners.clear();
  };
  child.on('exit', (code, signal) => finish({ exitCode: code ?? 0, signal: signal ? signalNameToNumber(signal) : undefined }));
  child.on('error', () => finish({ exitCode: 1, signal: undefined }));
  return {
    get pid() { return child.pid || 0; },
    onData(listener) {
      dataListeners.add(listener);
      return { dispose: () => dataListeners.delete(listener) };
    },
    onExit(listener) {
      if (exitEvent) {
        let disposed = false;
        queueMicrotask(() => { if (!disposed) listener(exitEvent); });
        return { dispose: () => { disposed = true; } };
      }
      exitListeners.add(listener);
      return { dispose: () => exitListeners.delete(listener) };
    },
    write(data) {
      if (!child.stdin.writable) return;
      try { child.stdin.write(data); } catch {}
    },
    resize() {},
    kill(signal) { try { child.kill(signal); } catch {} },
  };
}

function createPtySession(options) {
  let pty;
  try { pty = require('@lydell/node-pty'); } catch (error) {
    const wrapped = new Error('PTY session requires @lydell/node-pty; use createChildProcessSession when PTY is unavailable');
    wrapped.cause = error;
    throw wrapped;
  }
  const processHandle = pty.spawn(options.command, options.args || [], {
    name: 'xterm-256color', cols: options.cols || 80, rows: options.rows || 24,
    cwd: options.cwd, env: options.env, encoding: null,
  });
  const exitListeners = new Set();
  let exitEvent;
  processHandle.onExit(({ exitCode, signal }) => {
    exitEvent = { exitCode, signal };
    for (const listener of exitListeners) { try { listener(exitEvent); } catch {} }
    exitListeners.clear();
  });
  return {
    get pid() { return processHandle.pid; },
    onData(listener) {
      const disposable = processHandle.onData((data) => listener(Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary')));
      return { dispose: () => disposable.dispose() };
    },
    onExit(listener) {
      if (exitEvent) { queueMicrotask(() => listener(exitEvent)); return { dispose() {} }; }
      exitListeners.add(listener);
      return { dispose: () => exitListeners.delete(listener) };
    },
    write(data) { processHandle.write(Buffer.isBuffer(data) ? data.toString('binary') : data); },
    resize(cols, rows) { processHandle.resize(cols, rows); },
    kill(signal) { processHandle.kill(signal); },
  };
}

function createSessionProcess(options) {
  return process.platform === 'win32' ? createChildProcessSession(options) : createPtySession(options);
}

module.exports = { createChildProcessSession, createPtySession, createSessionProcess, signalNameToNumber };
