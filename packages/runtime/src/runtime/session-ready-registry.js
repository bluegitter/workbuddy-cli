'use strict';

const { randomUUID } = require('crypto');
const { SESSION_ENDPOINT_READY_TIMEOUT_MS } = require('./sidecar-protocol');

const ACCEPTED_REPORT_REPLAY_TTL_MS = 10 * 1000;

class SessionReadyRegistry {
  constructor({ createToken = randomUUID, replayTtlMs = ACCEPTED_REPORT_REPLAY_TTL_MS } = {}) {
    this.createToken = createToken;
    this.replayTtlMs = replayTtlMs;
    this.pending = new Map();
    this.accepted = new Map();
  }

  register(sessionId, timeoutMs = SESSION_ENDPOINT_READY_TIMEOUT_MS) {
    if (this.pending.has(sessionId)) throw new Error(`Session readiness is already pending: ${sessionId}`);
    this.clearAccepted(sessionId);
    const token = this.createToken();
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
    promise.catch(() => undefined);
    const timer = setTimeout(() => {
      const entry = this.pending.get(sessionId);
      if (!entry || entry.token !== token) return;
      this.pending.delete(sessionId);
      reject(new Error(`Session ${sessionId} did not report its runtime endpoint within ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
    this.pending.set(sessionId, { token, timer, resolve, reject });
    return {
      token,
      promise,
      arm: (expectedPid) => {
        if (!Number.isInteger(expectedPid) || expectedPid <= 0) throw new Error(`Cannot arm session readiness with invalid PID: ${expectedPid}`);
        const entry = this.pending.get(sessionId);
        if (!entry || entry.token !== token) throw new Error(`Session readiness is no longer pending: ${sessionId}`);
        entry.expectedPid = expectedPid;
      },
    };
  }

  accept(params) {
    if (params.protocolVersion !== 1) throw new Error(`Unsupported session readiness protocol version: ${params.protocolVersion}`);
    if (!Number.isInteger(params.port) || params.port < 1 || params.port > 65535) {
      throw new Error(`Invalid endpoint readiness port for session ${params.sessionId}: ${params.port}`);
    }
    const entry = this.pending.get(params.sessionId);
    if (!entry) {
      const accepted = this.accepted.get(params.sessionId);
      if (accepted && params.token === accepted.token && params.pid === accepted.report.pid && params.port === accepted.report.port) return { ...accepted.report };
      throw new Error(`No endpoint readiness handshake is pending for session ${params.sessionId}`);
    }
    if (params.token !== entry.token) throw new Error(`Invalid endpoint readiness token for session ${params.sessionId}`);
    if (entry.expectedPid === undefined) throw new Error(`Session readiness is not armed for session ${params.sessionId}`);
    if (params.pid !== entry.expectedPid) {
      throw new Error(`Endpoint readiness PID mismatch for session ${params.sessionId} (expected=${entry.expectedPid}, actual=${params.pid})`);
    }
    const report = { pid: params.pid, port: params.port };
    this.pending.delete(params.sessionId);
    clearTimeout(entry.timer);
    const timer = setTimeout(() => {
      if (this.accepted.get(params.sessionId)?.token === params.token) this.accepted.delete(params.sessionId);
    }, this.replayTtlMs);
    timer.unref?.();
    this.accepted.set(params.sessionId, { token: params.token, report, timer });
    entry.resolve(report);
    return { ...report };
  }

  reject(sessionId, error) {
    const entry = this.pending.get(sessionId);
    if (entry) {
      this.pending.delete(sessionId);
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.clearAccepted(sessionId);
  }

  rejectAll(error) {
    for (const sessionId of [...this.pending.keys()]) this.reject(sessionId, error);
    for (const sessionId of [...this.accepted.keys()]) this.clearAccepted(sessionId);
  }

  clearAccepted(sessionId) {
    const accepted = this.accepted.get(sessionId);
    if (!accepted) return;
    this.accepted.delete(sessionId);
    clearTimeout(accepted.timer);
  }
}

module.exports = { ACCEPTED_REPORT_REPLAY_TTL_MS, SessionReadyRegistry };
