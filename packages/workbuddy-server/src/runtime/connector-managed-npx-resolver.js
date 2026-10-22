'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { CLI_CONNECTOR_PACKAGES_DIR } = require('./connector-node-runtime-env');

function parseNpxPackageSpec(args = []) {
  const packageIndex = args.findIndex((arg) => arg && !arg.startsWith('-'));
  if (packageIndex < 0) return undefined;
  const packageSpec = args[packageIndex];
  const versionSeparator = packageSpec.startsWith('@') ? packageSpec.indexOf('@', 1) : packageSpec.indexOf('@');
  return {
    packageSpec,
    packageName: versionSeparator > 0 ? packageSpec.slice(0, versionSeparator) : packageSpec,
    serverArgs: args.slice(packageIndex + 1),
  };
}

function getManagedNpmCliPath(runtime) {
  return path.join(path.dirname(runtime.nodeInfo.executablePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
}

function getStableNpxPackageDir(packageSpec) {
  return path.join(CLI_CONNECTOR_PACKAGES_DIR, 'mcp-npx-packages', crypto.createHash('sha256').update(packageSpec).digest('hex').slice(0, 12));
}

function ensureStableNpxPackage(packageSpec, packageDir, runtime, env, logger) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  fs.mkdirSync(packageDir, { recursive: true });
  if (!fs.existsSync(packageJsonPath)) fs.writeFileSync(packageJsonPath, JSON.stringify({ private: true }, null, 2), 'utf8');
  logger.info(`[ConnectorMcpProxy] stdio MCP npx install start: package=${packageSpec} dir=${packageDir}`);
  return new Promise((resolve, reject) => {
    childProcess.execFile(runtime.nodeInfo.executablePath, [getManagedNpmCliPath(runtime), 'install', '--no-audit', '--no-fund', packageSpec], { cwd: packageDir, env, windowsHide: true, maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
      if (error) {
        const output = (stderr || stdout || error.message).trim();
        logger.warn(`[ConnectorMcpProxy] stdio MCP npx install failed: package=${packageSpec} error=${output}`);
        reject(new Error(`npm install ${packageSpec} failed: ${output}`));
        return;
      }
      logger.info(`[ConnectorMcpProxy] stdio MCP npx install success: package=${packageSpec}`);
      resolve();
    });
  });
}

function resolvePackageBin(packageDir, packageName, runtime, serverArgs) {
  const installedPackageDir = path.join(packageDir, 'node_modules', ...packageName.split('/'));
  const manifest = JSON.parse(fs.readFileSync(path.join(installedPackageDir, 'package.json'), 'utf8'));
  const { bin } = manifest;
  if (!bin) return undefined;
  const fallbackBinName = packageName.split('/').pop() || packageName;
  const binNames = typeof bin === 'string' ? [] : Object.keys(bin);
  if (typeof bin !== 'string' && binNames.length === 0) return undefined;
  const binName = typeof bin === 'string' ? fallbackBinName : binNames.includes(fallbackBinName) ? fallbackBinName : binNames[0];
  const binPath = path.resolve(installedPackageDir, typeof bin === 'string' ? bin : bin[binName]);
  const nativeBin = path.join(installedPackageDir, 'node_modules', '.bin_real', `${binName}.exe`);
  if (process.platform === 'win32' && fs.existsSync(nativeBin)) return { command: nativeBin, args: serverArgs };
  if (process.platform === 'win32' && path.extname(binPath).toLowerCase() === '.cmd') return { command: 'cmd.exe', args: ['/c', binPath, ...serverArgs] };
  return { command: runtime.nodeInfo.executablePath, args: [binPath, ...serverArgs] };
}

async function resolveManagedNpxCommand(options) {
  const { configId, command, args, runtime, env, logger } = options;
  if (process.platform !== 'win32' || command !== 'npx' || !runtime) return { command, args };
  const parsed = parseNpxPackageSpec(args);
  if (!parsed) return { command, args };
  try {
    const packageDir = getStableNpxPackageDir(parsed.packageSpec);
    logger.info(`[ConnectorMcpProxy] stdio MCP ${configId} npx resolve start: package=${parsed.packageSpec} packageName=${parsed.packageName} args=${parsed.serverArgs.length} dir=${packageDir}`);
    await ensureStableNpxPackage(parsed.packageSpec, packageDir, runtime, env, logger);
    const resolved = resolvePackageBin(packageDir, parsed.packageName, runtime, parsed.serverArgs);
    if (resolved) return resolved;
    logger.warn(`[ConnectorMcpProxy] stdio MCP ${configId} npx resolve empty: package=${parsed.packageSpec} packageName=${parsed.packageName} dir=${packageDir}`);
  } catch (error) {
    logger.warn(`[ConnectorMcpProxy] stdio MCP ${configId} failed to resolve npx package; falling back to npx: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { command, args };
}

module.exports = { parseNpxPackageSpec, getManagedNpmCliPath, getStableNpxPackageDir, ensureStableNpxPackage, resolvePackageBin, resolveManagedNpxCommand };
