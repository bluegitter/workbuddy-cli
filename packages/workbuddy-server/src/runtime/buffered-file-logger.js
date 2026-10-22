'use strict';

const fs = require('fs');
const path = require('path');

class BufferedFileLogger {
  constructor(options) {
    this.logDir = options.logDir;
    this.filePrefix = options.filePrefix;
    this.retentionDays = options.retentionDays ?? 30;
    this.bufferThreshold = options.bufferThreshold ?? 50;
    this.buffer = [];
    this.isFlushing = false;
    this.flushTimer = null;
    this.ensureDir(this.logDir);
    this.logFilePath = path.join(this.logDir, `${this.filePrefix}-${this.formatDate(new Date())}.log`);
    this.startFlushTimer(options.flushIntervalMs ?? 200);
    this.registerExitHook();
    this.cleanupOldLogs();
    this.writeSessionSeparator();
  }
  getLogFilePath() { return this.logFilePath; }
  debug(message) { this.write('debug', message); }
  info(message) { this.write('info', message); }
  warn(message) { this.write('warn', message); }
  error(message, error) { this.write('error', error ? `${message}\n  Stack: ${error.stack || error.message}` : message); }
  write(level, message) { this.buffer.push(`[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${message}\n`); if (this.buffer.length >= this.bufferThreshold) this.flush().catch(() => {}); }
  async flush() { if (this.isFlushing || !this.buffer.length) return; this.isFlushing = true; const lines = this.buffer.splice(0); try { await fs.promises.appendFile(this.logFilePath, lines.join(''), 'utf8'); } catch { this.buffer.unshift(...lines); } finally { this.isFlushing = false; } }
  flushSync() { if (!this.buffer.length) return; try { fs.appendFileSync(this.logFilePath, this.buffer.splice(0).join(''), 'utf8'); } catch {} }
  dispose() { if (this.flushTimer) clearInterval(this.flushTimer); this.flushTimer = null; this.flushSync(); }
  startFlushTimer(intervalMs) { this.flushTimer = setInterval(() => this.flush().catch(() => {}), intervalMs); this.flushTimer.unref?.(); }
  registerExitHook() { process.on('exit', () => this.flushSync()); }
  ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
  formatDate(date) { const pad = (value) => String(value).padStart(2, '0'); return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`; }
  writeSessionSeparator() { const timestamp = new Date().toISOString(); this.buffer.push(`\n${'='.repeat(80)}\n  Session started at ${timestamp}\n${'='.repeat(80)}\n`); }
  cleanupOldLogs() { this.cleanupOldLogsAsync().catch(() => {}); }
  async cleanupOldLogsAsync() { try { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - this.retentionDays); const cutoffStr = this.formatDate(cutoff); const prefix = `${this.filePrefix}-`; for (const file of await fs.promises.readdir(this.logDir)) if (file.startsWith(prefix) && file.endsWith('.log') && file.slice(prefix.length, -4) < cutoffStr) await fs.promises.unlink(path.join(this.logDir, file)).catch(() => {}); } catch {} }
}

module.exports = Object.freeze({ BufferedFileLogger });
