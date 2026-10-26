'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DEBOUNCE_MS = 300;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const NAME_LINE = /^[-\s]*(?:\*\*)?(?:Name|name|姓名|名字)(?:\*\*[：:]|[：:])\s*(?:\*\*\s*)?(.+)$/m;

class IdentityService {
  constructor({ pushEvent, configDir, logger = console, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, changedChannel = 'identity:changed' } = {}) {
    this.pushEvent = pushEvent;
    this.logger = logger;
    this.changedChannel = changedChannel;
    this.identityDir = configDir || process.env.WORKBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy');
    this.identityPath = path.join(this.identityDir, 'IDENTITY.md');
    this.pollIntervalMs = pollIntervalMs;
    this.pollActive = false;
    this.disposed = false;
    this.lastBroadcastName = undefined;
  }

  async start() {
    await fsp.mkdir(this.identityDir, { recursive: true }).catch(() => {});
    this.lastBroadcastName = await this.readName();
    this.startPolling();
  }

  dispose() {
    this.disposed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.pollActive) fs.unwatchFile(this.identityPath);
    this.pollActive = false;
  }

  async readName() {
    try { return NAME_LINE.exec(await fsp.readFile(this.identityPath, 'utf8'))?.[1]?.trim(); } catch { return undefined; }
  }

  async writeName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('IdentityService.writeName: name must not be empty');
    await fsp.mkdir(this.identityDir, { recursive: true });
    let current = '';
    try { current = await fsp.readFile(this.identityPath, 'utf8'); } catch {}
    const replacement = `- **Name:** ${trimmed}`;
    const next = NAME_LINE.test(current)
      ? current.replace(NAME_LINE, replacement)
      : current.trim() ? `${current}${current.endsWith('\n') ? '' : '\n'}${replacement}\n` : `# Identity\n\n${replacement}\n`;
    await fsp.writeFile(this.identityPath, next, 'utf8');
    this.startPolling();
  }

  startPolling() {
    if (this.pollActive || this.disposed) return;
    this.pollActive = true;
    fs.watchFile(this.identityPath, { interval: this.pollIntervalMs, persistent: false }, (current, previous) => {
      if (!this.disposed && (current.mtimeMs !== previous.mtimeMs || current.ctimeMs !== previous.ctimeMs || current.size !== previous.size || current.ino !== previous.ino)) this.scheduleBroadcast();
    });
  }

  scheduleBroadcast() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.broadcastCurrentName(), DEBOUNCE_MS);
  }

  async broadcastCurrentName() {
    if (this.disposed) return;
    const name = await this.readName();
    if (!name || name === this.lastBroadcastName) return;
    this.lastBroadcastName = name;
    this.pushEvent?.(this.changedChannel, { name, timestamp: Date.now() });
  }
}

module.exports = { DEBOUNCE_MS, DEFAULT_POLL_INTERVAL_MS, NAME_LINE, IdentityService };
