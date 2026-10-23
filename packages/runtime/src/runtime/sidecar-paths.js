'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_RING_BUFFER_BYTES = 8 * 1024 * 1024;
const IDLE_TIMEOUT_MS = 1800 * 1000;
const RPC_TIMEOUT_MS = 10 * 1000;
const SESSION_LIFECYCLE_RPC_TIMEOUT_MS = 60 * 1000;
const SESSION_ENDPOINT_READY_TIMEOUT_MS = 180 * 1000;
const SESSION_CREATE_RPC_TIMEOUT_MS = SESSION_ENDPOINT_READY_TIMEOUT_MS + 15 * 1000;
const SIDECAR_READY_SOCKET_ENV = 'CODEBUDDY_SIDECAR_READY_SOCKET';
const SIDECAR_READY_TOKEN_ENV = 'CODEBUDDY_SIDECAR_READY_TOKEN';
const SIDECAR_READY_SESSION_ID_ENV = 'CODEBUDDY_SIDECAR_READY_SESSION_ID';
const SIDECAR_GRACEFUL_EXIT_TIMEOUT_MS = 10 * 1000;
const JSON_RPC_PARSE_ERROR = -32700;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_INTERNAL_ERROR = -32603;
const JSON_RPC_SESSION_NOT_FOUND = -32000;
const WINDOWS_PIPE_PREFIX = '\\\\.\\pipe\\';
const CONTROL_PIPE_KEY = 'sidecar-control';
const DATA_PIPE_KEY = 'sidecar-data';
const SUN_PATH_MAX_BYTES = 104;
const SUN_PATH_SAFETY_MARGIN = 3;

function workbuddyConfigDir(env = process.env) {
  return env.WORKBUDDY_CONFIG_DIR?.trim() || env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy');
}

function hashToken(value, length) { return crypto.createHash('sha1').update(value).digest('hex').slice(0, length); }
function instanceToken(env = process.env) { return hashToken(workbuddyConfigDir(env), 12); }

function isWritableDir(dir) {
  try { return fs.statSync(dir).isDirectory() && (fs.accessSync(dir, fs.constants.W_OK), true); } catch { return false; }
}

function sidecarRuntimeDir(env = process.env, platform = process.platform) {
  const token = instanceToken(env);
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (platform === 'linux') {
    const xdg = env.XDG_RUNTIME_DIR?.trim();
    if (xdg && isWritableDir(xdg)) return path.join(xdg, 'workbuddy', token);
    if (uid !== undefined && isWritableDir(`/run/user/${uid}`)) return path.join(`/run/user/${uid}`, 'workbuddy', token);
  }
  const base = uid !== undefined ? `wb-${hashToken(String(uid), 6)}` : 'wb';
  return path.join(os.tmpdir().trim(), base, token);
}

async function ensureSidecarRuntimeDir(env = process.env, platform = process.platform) {
  const dir = sidecarRuntimeDir(env, platform);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  try { await fs.promises.chmod(dir, 0o700); } catch {}
  return dir;
}

function isNamedPipe(platform = process.platform) { return platform === 'win32'; }
function buildNamedPipePath(name, env = process.env) { return `${WINDOWS_PIPE_PREFIX}workbuddy-${instanceToken(env)}-${name}`; }
function sanitizePipeToken(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'session'; }

function controlSocketPath(env = process.env, platform = process.platform) {
  return isNamedPipe(platform) ? buildNamedPipePath(CONTROL_PIPE_KEY, env) : path.join(sidecarRuntimeDir(env, platform), 'sidecar.sock');
}

function dataSocketPath(id, env = process.env, platform = process.platform) {
  if (isNamedPipe(platform)) return buildNamedPipePath(`${DATA_PIPE_KEY}-${sanitizePipeToken(id)}-${hashToken(id, 8)}`, env);
  const primary = path.join(sidecarRuntimeDir(env, platform), `s-${hashToken(id, 16)}.sock`);
  if (Buffer.byteLength(primary) + SUN_PATH_SAFETY_MARGIN <= SUN_PATH_MAX_BYTES) return primary;
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const shortDir = path.join('/tmp', uid !== undefined ? `wb-${hashToken(String(uid), 6)}` : 'wb', instanceToken(env));
  try { fs.mkdirSync(shortDir, { recursive: true, mode: 0o700 }); fs.chmodSync(shortDir, 0o700); } catch {}
  return path.join(shortDir, `s-${hashToken(id, 16)}.sock`);
}

function pidFilePath(env = process.env, platform = process.platform) { return path.join(sidecarRuntimeDir(env, platform), 'sidecar.pid'); }

module.exports = Object.freeze({
  CONTROL_PIPE_KEY, DATA_PIPE_KEY, DEFAULT_RING_BUFFER_BYTES, IDLE_TIMEOUT_MS, JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS, JSON_RPC_METHOD_NOT_FOUND, JSON_RPC_PARSE_ERROR, JSON_RPC_SESSION_NOT_FOUND,
  RPC_TIMEOUT_MS, SESSION_CREATE_RPC_TIMEOUT_MS, SESSION_ENDPOINT_READY_TIMEOUT_MS,
  SESSION_LIFECYCLE_RPC_TIMEOUT_MS, SIDECAR_GRACEFUL_EXIT_TIMEOUT_MS, SIDECAR_READY_SESSION_ID_ENV,
  SIDECAR_READY_SOCKET_ENV, SIDECAR_READY_TOKEN_ENV, buildNamedPipePath, controlSocketPath,
  dataSocketPath, ensureSidecarRuntimeDir, hashToken, instanceToken, isNamedPipe, pidFilePath,
  sanitizePipeToken, sidecarRuntimeDir, workbuddyConfigDir,
});
