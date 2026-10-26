'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { classifyBinaryError, createRuntimeProgressNotifier } = require('./runtime-progress-notifier');

const DEFAULT_NPM_REGISTRIES = [
  'https://mirrors.cloud.tencent.com/npm/',
  'https://registry.npmmirror.com/',
  'https://registry.npmjs.org/',
];
const CLI_CONNECTOR_PACKAGES_DIR = path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'cli-connector-packages');
const CLI_CONNECTOR_NPM_CACHE_DIR = path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'cli-connector-cache');

function normalizePathSegment(value, isWindows) {
  const normalized = value.replace(/[\\/]+$/, '');
  return isWindows ? normalized.toLowerCase() : normalized;
}

function dedupePathSegments(values, isWindows) {
  const seen = new Set();
  return values.filter(Boolean).filter((value) => {
    const key = normalizePathSegment(value, isWindows);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prependRuntimePath(env, paths) {
  const isWindows = process.platform === 'win32';
  const pathKeys = Object.keys(env).filter((key) => key.toLowerCase() === 'path');
  const pathKey = isWindows ? [...pathKeys].sort()[0] || 'Path' : 'PATH';
  const existing = (isWindows ? pathKeys : [pathKey]).flatMap((key) => (env[key] || '').split(path.delimiter));
  if (isWindows) for (const key of pathKeys) if (key !== pathKey) delete env[key];
  env[pathKey] = dedupePathSegments([...paths, ...existing], isWindows).join(path.delimiter);
}

function applyNodeRuntimeEnv(env, runtime) {
  const { nodeInfo, nodeBinDir, npmGlobalBin, registry } = runtime;
  prependRuntimePath(env, [path.join(CLI_CONNECTOR_PACKAGES_DIR, 'bin'), npmGlobalBin, nodeBinDir]);
  env.npm_config_registry = registry;
  env.npm_config_prefix = CLI_CONNECTOR_PACKAGES_DIR;
  env.npm_config_cache = CLI_CONNECTOR_NPM_CACHE_DIR;
  if (env.HTTPS_PROXY && !(env.NODE_OPTIONS || '').includes('--use-system-ca')) {
    const [major, minor] = nodeInfo.version.split('.').map(Number);
    if (major > 20 || (major === 20 && minor >= 12)) env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --use-system-ca`.trim();
    else env.npm_config_strict_ssl = 'false';
  }
}

async function prepareNodeRuntimeEnv(binaryManager, requirement = {}, logger = { info() {}, warn() {} }, options = {}) {
  const versionRange = requirement.versionRange ?? '*';
  const notifier = createRuntimeProgressNotifier(options.operationId || crypto.randomUUID(), 'node', versionRange, options);
  if (binaryManager.isInstallingType('node')) notifier.preparing();
  let nodeInfo;
  try {
    nodeInfo = await binaryManager.ensure({ type: 'node', versionRange }, { onProgress: notifier.onProgress });
    notifier.complete();
  } catch (error) {
    notifier.error(classifyBinaryError(error));
    throw error;
  }
  const npmGlobalBin = process.platform === 'win32' ? CLI_CONNECTOR_PACKAGES_DIR : path.join(CLI_CONNECTOR_PACKAGES_DIR, 'bin');
  const nodeBinDir = path.join(nodeInfo.executablePath, '..');
  const registry = requirement.registry ?? DEFAULT_NPM_REGISTRIES[0];
  const managedTag = nodeInfo.source === 'managed' ? '[MANAGED-HIT] ' : '';
  logger.info(`${managedTag}[NodeRuntimeEnv] Node runtime: source=${nodeInfo.source} version=${nodeInfo.version} node=${nodeInfo.executablePath} prefix=${CLI_CONNECTOR_PACKAGES_DIR} registry=${registry}`);
  return { nodeInfo: { type: nodeInfo.type, version: nodeInfo.version, source: nodeInfo.source, executablePath: nodeInfo.executablePath }, nodeBinDir, npmGlobalBin, registry };
}

function stripDebugNodeOptions(env) {
  env.NODE_OPTIONS = (env.NODE_OPTIONS || '').replace(/--inspect(-brk)?(=\S+)?|--debug(=\S+)?/g, '').trim() || undefined;
  delete env.NODE_DEBUG;
}

module.exports = {
  DEFAULT_NPM_REGISTRIES,
  CLI_CONNECTOR_PACKAGES_DIR,
  CLI_CONNECTOR_NPM_CACHE_DIR,
  prependRuntimePath,
  dedupePathSegments,
  normalizePathSegment,
  applyNodeRuntimeEnv,
  prepareNodeRuntimeEnv,
  stripDebugNodeOptions,
};
