'use strict';

const { promisify } = require('node:util');
const { exec, spawn } = require('node:child_process');
const { homedir, platform } = require('node:os');
const {
  DEFAULT_NPM_REGISTRIES,
  applyNodeRuntimeEnv,
  prepareNodeRuntimeEnv,
  stripDebugNodeOptions,
} = require('./connector-node-runtime-env');

const execAsync = promisify(exec);
const DEFAULT_HOST_CAPABILITIES = Object.freeze({
  openExternal: async () => { throw new Error('ConnectorCliExecutor host capability openExternal is not available'); },
  sendRuntimeProgress: () => { throw new Error('ConnectorCliExecutor host capability sendRuntimeProgress is not available'); },
});

function semverGte(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l !== r) return l > r;
  }
  return true;
}

function applyCliConfigEnv(env, configEnv) {
  if (!configEnv) return;
  for (const [key, value] of Object.entries(configEnv)) {
    if (typeof value === 'string') env[key] = value.replace(/\$\{HOME\}|\$HOME/g, homedir());
  }
}

class ConnectorCliExecutor {
  constructor({ logger = console, binaryManager, hostCapabilities } = {}) {
    this.logger = logger;
    this.binaryManager = binaryManager;
    this.hostCapabilities = { ...DEFAULT_HOST_CAPABILITIES, ...hostCapabilities };
  }

  setHostCapabilities(capabilities = {}) { this.hostCapabilities = { ...this.hostCapabilities, ...capabilities }; }
  getPlatformCommand(commands = {}) { return commands[platform()]; }

  async buildCommandEnv(cliConfig = {}, options = {}, registry) {
    const env = { ...process.env };
    stripDebugNodeOptions(env);
    if (cliConfig.runtime?.type !== 'node' || !this.binaryManager) {
      if (cliConfig.runtime?.type === 'node' && !this.binaryManager) this.logger.warn?.('[CliExecutor] BinaryManager unavailable; using inherited PATH');
      applyCliConfigEnv(env, cliConfig.env);
      return env;
    }
    const runtime = await prepareNodeRuntimeEnv(this.binaryManager, {
      versionRange: cliConfig.runtime.version || '*',
      registry: registry || cliConfig.npmRegistry,
    }, this.logger, { silent: options.silent === true, send: this.hostCapabilities.sendRuntimeProgress });
    applyNodeRuntimeEnv(env, runtime);
    applyCliConfigEnv(env, cliConfig.env);
    return env;
  }

  extractExecutable(command) {
    const text = String(command || '').trim();
    if (!text) return null;
    let token = ''; let quote = null;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote === "'") { if (ch === "'") quote = null; else token += ch; continue; }
      if (quote === '"') {
        if (ch === '"') { quote = null; continue; }
        if (ch === '\\' && ['\\', '"'].includes(text[i + 1])) { token += text[++i]; continue; }
        token += ch; continue;
      }
      if (/\s/.test(ch) || '|;&<>()`$'.includes(ch)) break;
      if (ch === '\\' && i + 1 < text.length) { token += text[++i]; continue; }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      token += ch;
    }
    return quote ? null : (token || null);
  }

  quoteForShell(value, isWindows = platform() === 'win32') {
    return isWindows ? `"${String(value).replace(/"/g, '\\"')}"` : `'${String(value).replace(/'/g, "'\\''")}'`;
  }

  normalizeAuthSteps(cliConfig = {}) {
    if (!cliConfig.auth) return [];
    return Array.isArray(cliConfig.auth) ? cliConfig.auth : [{ command: cliConfig.auth }];
  }

  resolveStepConfig(step, cliConfig = {}) {
    return {
      command: step.command,
      authWaitForExit: step.authWaitForExit ?? cliConfig.authWaitForExit,
      authUrlDomain: step.authUrlDomain ?? cliConfig.authUrlDomain,
      authSuppressBrowser: step.authSuppressBrowser ?? cliConfig.authSuppressBrowser,
      authDeviceFlow: step.authDeviceFlow ?? cliConfig.authDeviceFlow,
    };
  }

  resolveRegistries(config = {}) { return config.npmRegistries?.length ? config.npmRegistries : config.npmRegistry ? [config.npmRegistry] : [...DEFAULT_NPM_REGISTRIES]; }
  isNetworkError(output) { return ['FETCH_ERROR', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'socket hang up', 'invalid json response body'].some((part) => String(output).includes(part)); }

  async isCliInstalled(cliConfig = {}, options = {}) {
    const first = this.normalizeAuthSteps(cliConfig)[0]?.command;
    const command = this.getPlatformCommand(first || cliConfig.status || {});
    const executable = this.extractExecutable(command);
    if (!executable) return false;
    try {
      await execAsync(`${platform() === 'win32' ? 'where' : 'which'} ${this.quoteForShell(executable)}`, { timeout: 5000, env: await this.buildCommandEnv(cliConfig, options), windowsHide: true });
      return true;
    } catch { return false; }
  }

  async runInstall(cliConfig = {}, options = {}) {
    const command = this.getPlatformCommand(cliConfig.init || {});
    if (!command) return { success: false, stdout: '', stderr: `No init command for platform ${platform()}`, exitCode: -1 };
    let last;
    for (const registry of this.resolveRegistries(cliConfig)) {
      last = await this.executeCommand(command, { timeout: 300000, env: await this.buildCommandEnv(cliConfig, options, registry) });
      if (last.success || !this.isNetworkError(`${last.stderr}\n${last.stdout}`)) return last;
    }
    return last;
  }

  async runAuth(cliConfig = {}, options = {}, signal) {
    const steps = this.normalizeAuthSteps(cliConfig);
    if (!steps.length) return { success: false, stdout: '', stderr: `No auth command for platform ${platform()}`, exitCode: -1 };
    const env = await this.buildCommandEnv(cliConfig, options);
    let result;
    for (const step of steps) {
      if (signal?.aborted) return { success: false, stdout: '', stderr: 'Cancelled by user', exitCode: -1, cancelled: true };
      const effective = this.resolveStepConfig(step, cliConfig);
      const command = this.getPlatformCommand(effective.command || {});
      if (!command) return { success: false, stdout: '', stderr: `No auth command for platform ${platform()}`, exitCode: -1 };
      result = await this.runAuthStep(command, env, effective, options, signal);
      if (!result.success) return result;
    }
    return result;
  }

  runAuthStep(command, env, effective, options = {}, signal) {
    const waitForExit = effective.authWaitForExit === true || Boolean(effective.authDeviceFlow && options.onDeviceCode);
    return new Promise((resolve) => {
      const child = spawn(command, { shell: true, timeout: waitForExit ? 300000 : 10000, env, windowsHide: true });
      let stdout = ''; let stderr = ''; let resolved = false; let opened = false;
      const finish = (value) => { if (resolved) return; resolved = true; signal?.removeEventListener('abort', abort); resolve(value); };
      const abort = () => { try { child.kill(); } catch {} finish({ success: false, stdout, stderr, exitCode: -1, cancelled: true }); };
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      const inspect = (text) => {
        if (effective.authDeviceFlow && options.onDeviceCode) {
          const info = this.extractDeviceFlowInfo(text, effective.authDeviceFlow);
          if (info) { options.onDeviceCode(info); if (!effective.authSuppressBrowser && !options.suppressBrowser) Promise.resolve(this.hostCapabilities.openExternal(info.verificationUri)).catch(() => {}); }
        }
        if (!opened && !effective.authDeviceFlow) {
          const url = this.extractAuthUrl(text, effective.authUrlDomain);
          if (url) {
            opened = true;
            if (options.onQrUrl) options.onQrUrl(url);
            else if (!effective.authSuppressBrowser && !options.suppressBrowser) Promise.resolve(this.hostCapabilities.openExternal(url)).catch(() => {});
            if (!waitForExit) { try { child.kill(); } catch {} finish({ success: true, stdout, stderr, exitCode: 0, authUrl: url }); }
          }
        }
      };
      child.stdout?.on('data', (data) => { stdout += data.toString(); inspect(stdout); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); inspect(stderr); });
      child.on('close', (code) => finish({ success: code === 0, stdout, stderr, exitCode: code ?? -1, authUrl: this.extractAuthUrl(stdout + stderr, effective.authUrlDomain) }));
      child.on('error', (error) => finish({ success: false, stdout, stderr: error.message, exitCode: -1 }));
    });
  }

  async executeCommand(command, options = {}) {
    const env = options.env || (() => { const value = { ...process.env }; delete value.NODE_OPTIONS; delete value.NODE_DEBUG; return value; })();
    try {
      const result = await execAsync(command, { timeout: options.timeout || 30000, env, windowsHide: true });
      return { success: true, stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      return { success: false, stdout: error.stdout || '', stderr: error.stderr || error.message, exitCode: error.code ?? -1 };
    }
  }

  async runStatus(cliConfig = {}, options = {}) {
    const command = this.getPlatformCommand(cliConfig.status || {});
    if (!command) return { success: false, stdout: '', stderr: `No status command for platform ${platform()}`, exitCode: -1 };
    const result = await this.executeCommand(command, { timeout: 10000, env: await this.buildCommandEnv(cliConfig, options) });
    if (result.exitCode === 0 && cliConfig.statusMatchJson) {
      try { const parsed = JSON.parse(result.stdout); result.success = Object.entries(cliConfig.statusMatchJson).every(([key, value]) => String(parsed[key]) === String(value)); } catch { result.success = false; }
    } else if (result.exitCode === 0 && cliConfig.statusMatch) result.success = new RegExp(cliConfig.statusMatch).test(result.stdout + result.stderr);
    return result;
  }

  async runUnAuth(cliConfig = {}, options = {}) {
    const command = this.getPlatformCommand(cliConfig.unAuth || {});
    if (!command) return { success: false, stdout: '', stderr: `No unAuth command for platform ${platform()}`, exitCode: -1 };
    return this.executeCommand(command, { timeout: 30000, env: await this.buildCommandEnv(cliConfig, options) });
  }

  extractAuthUrl(text, domain) {
    for (const match of String(text || '').matchAll(/https?:\/\/[^\s\n\r"'<>]+/g)) {
      if (!domain && match[0].startsWith('https://')) return match[0];
      if (domain && match[0].includes(domain)) return match[0];
    }
    return undefined;
  }

  extractDeviceFlowInfo(text, config = {}) {
    let uri; let code;
    try { const match = String(text).match(new RegExp(config.uriPattern)); if (match) uri = (match[1] ?? match[0]).trim(); } catch (error) { this.logger.warn?.(`[CliExecutor] invalid device flow uriPattern: ${error}`); }
    if (!uri) return undefined;
    if (config.codePattern) try { const match = String(text).match(new RegExp(config.codePattern)); if (match) code = (match[1] ?? match[0]).trim(); } catch (error) { this.logger.warn?.(`[CliExecutor] invalid device flow codePattern: ${error}`); }
    return { verificationUri: uri, userCode: code, expiresIn: config.defaultExpiresInSeconds, codeEmbeddedInUri: config.codeEmbeddedInUri };
  }

  async checkVersion(cliConfig = {}, options = {}) {
    const check = cliConfig.versionCheck; if (!check) return { needsUpgrade: false };
    const command = this.getPlatformCommand(check.command || {}); if (!command) return { needsUpgrade: false };
    const result = await this.executeCommand(command, { timeout: 10000, env: await this.buildCommandEnv(cliConfig, options) });
    if (result.exitCode !== 0) return { needsUpgrade: true };
    const match = (result.stdout + result.stderr).match(new RegExp(check.versionPattern || '(\\d+\\.\\d+\\.\\d+)'));
    if (!match) return { needsUpgrade: true };
    return { needsUpgrade: !semverGte(match[1], check.minVersion), currentVersion: match[1] };
  }

  async pollAuthCompletion(cliConfig, timeoutMs = 300000, pollIntervalMs = 3000, signal) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs && !signal?.aborted) {
      await new Promise((resolve) => { const timer = setTimeout(resolve, pollIntervalMs); signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); });
      if (signal?.aborted) return false;
      if ((await this.runStatus(cliConfig)).success) return true;
    }
    return false;
  }
}

module.exports = Object.freeze({ ConnectorCliExecutor, DEFAULT_HOST_CAPABILITIES, semverGte, applyCliConfigEnv });
