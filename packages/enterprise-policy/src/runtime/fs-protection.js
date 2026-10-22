'use strict';

const os = require('os');
const path = require('path');
const { fileURLToPath } = require('url');

function resolveConfigDir(env = process.env) {
  const configured = (env.WORKBUDDY_CONFIG_DIR || env.CODEBUDDY_CONFIG_DIR || '').trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), '.workbuddy');
}

function toAbsolutePath(value) {
  if (value instanceof URL || (value && typeof value === 'object' && value.href && value.protocol)) return fileURLToPath(value);
  return path.resolve(String(value));
}

function isPathWithin(base, target) {
  if (base === target) return true;
  const relative = path.relative(base, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

class FsProtectionPolicy {
  constructor({ configDir = resolveConfigDir(), platform = process.platform } = {}) {
    this.platform = platform;
    this.configDir = path.resolve(configDir);
    this.protectedPaths = [
      this.configDir,
      path.join(this.configDir, 'workbuddy.db'),
      path.join(this.configDir, 'app'),
      path.join(this.configDir, 'memory'),
      path.join(this.configDir, 'logs'),
    ].map((item) => this.key(item));
  }

  key(value) { const resolved = path.resolve(value); return this.platform === 'win32' ? resolved.toLowerCase() : resolved; }

  inspect(filePath, { recursive = false } = {}) {
    const absolutePath = toAbsolutePath(filePath);
    const target = this.key(absolutePath);
    const config = this.key(this.configDir);
    if (!isPathWithin(config, target)) return { decision: 'IGNORE', target: absolutePath, recursive };
    const protectedPath = this.protectedPaths.find((sentinel) => sentinel === target || (recursive && isPathWithin(target, sentinel)));
    return { decision: protectedPath ? 'WARN' : 'ALLOW', target: absolutePath, recursive, protectedPath };
  }
}

module.exports = { FsProtectionPolicy, isPathWithin, resolveConfigDir, toAbsolutePath };
