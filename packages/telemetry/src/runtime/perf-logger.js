'use strict';

const fs = require('fs');
const path = require('path');

const PerfFlow = Object.freeze({ SESSION_CREATION: 'session-creation', SESSION_LOAD: 'session-load', STARTUP: 'startup' });

class WorkbuddyPerfLogger {
  constructor(flowType, options = {}) {
    this.flowType = flowType;
    this.startTime = performance.now();
    this.lastMarkTime = this.startTime;
    this.startupContext = flowType === PerfFlow.STARTUP ? options.startupContext : undefined;
    this.logDirectory = options.logDirectory || path.join(process.cwd(), 'logs', 'perf');
    this.logFilePath = this.resolveLogFilePath(options);
    this.marks = [];
    this.phaseStartTimes = new Map();
    this.summaryWritten = false;
  }

  resolveLogFilePath(options) {
    const ctx = this.startupContext;
    const directory = ctx
      ? path.join(this.logDirectory, 'startup', ctx.date)
      : this.logDirectory;
    this.ensureDirectory(directory);
    const name = ctx ? `${ctx.pid}-${ctx.time}.jsonl` : `${this.flowType}-${this.formatTimestamp(new Date())}.jsonl`;
    return path.join(directory, name);
  }

  mark(phase, data) {
    const now = performance.now();
    const mark = {
      _type: 'mark', timestamp: now, epochMs: Date.now(), phase,
      elapsed: Math.round((now - this.startTime) * 100) / 100,
      delta: Math.round((now - this.lastMarkTime) * 100) / 100,
      source: this.startupContext?.proc || 'main',
      ...(this.startupContext ? { pid: this.startupContext.pid, proc: this.startupContext.proc, timeOrigin: this.startupContext.timeOrigin } : {}),
      ...(data ? { data } : {}),
    };
    this.lastMarkTime = now;
    this.marks.push(mark);
    this.appendLine(JSON.stringify(mark));
    return mark;
  }

  markAbsolute(phase, epochMs, data) {
    this.appendLine(JSON.stringify({ _type: 'mark', epochMs, phase, source: this.startupContext?.proc || 'main', ...(this.startupContext || {}), ...(data ? { data } : {}) }));
  }

  startPhase(phase) { this.phaseStartTimes.set(phase, performance.now()); this.mark(`${phase}_start`); }
  endPhase(phase) {
    const durationMs = performance.now() - (this.phaseStartTimes.get(phase) ?? this.startTime);
    this.mark(`${phase}_end`, { durationMs: Math.round(durationMs) });
    this.phaseStartTimes.delete(phase);
    return durationMs;
  }
  appendRendererLine(line) { this.appendLine(String(line).trimEnd()); }
  getLogFilePath() { return this.logFilePath; }
  getSummary() {
    const phases = {};
    const starts = new Map();
    for (const mark of this.marks) {
      if (mark.phase.endsWith('_start')) {
        const name = mark.phase.slice(0, -6);
        starts.set(name, { time: mark.timestamp, count: (starts.get(name)?.count || 0) + 1 });
      } else if (mark.phase.endsWith('_end')) {
        const name = mark.phase.slice(0, -4); const start = starts.get(name);
        if (start) phases[name] = { durationMs: mark.data?.durationMs ?? Math.round(mark.timestamp - start.time), markCount: start.count + 1 };
      }
    }
    return { flowType: this.flowType, totalDurationMs: Math.round(performance.now() - this.startTime), totalMarks: this.marks.length, phases };
  }
  flush() {
    if (this.summaryWritten) return;
    this.appendLine(JSON.stringify({ _type: 'summary', ...this.getSummary() }));
    this.summaryWritten = true;
  }
  appendLine(line) {
    try { fs.appendFileSync(this.logFilePath, `[${new Date().toISOString()}] ${line}\n`, 'utf8'); } catch { /* best effort */ }
  }
  ensureDirectory(directory) { try { fs.mkdirSync(directory, { recursive: true }); } catch {} }
  formatTimestamp(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
}

const loggers = new Map();
function getWorkbuddyPerfLogger(flowType, options) {
  if (!loggers.has(flowType)) loggers.set(flowType, new WorkbuddyPerfLogger(flowType, options));
  return loggers.get(flowType);
}

module.exports = Object.freeze({ PerfFlow, WorkbuddyPerfLogger, getWorkbuddyPerfLogger });
