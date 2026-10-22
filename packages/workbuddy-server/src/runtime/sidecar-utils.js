'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const net = require('net');

const HOST_RUNTIME_SESSION_ID = '__workbuddy_cli_host__';
const STALE_PIPE_PROBE_INTERVAL_MS = 150;
function formatSidecarLogArgs(args) { return args.map((arg) => { if (typeof arg === 'string') return arg; if (arg instanceof Error) return arg.stack || arg.message; try { return JSON.stringify(arg); } catch { return String(arg); } }).join(' '); }
function isExpectedSidecarShutdownLine(line) { return line === '[Sidecar] Shutting down...' || /^\[Sidecar\] Killing session .+ \(pid=\d+\)$/.test(line); }
function isHostedCliRuntimeSessionId(sessionId) { return sessionId === HOST_RUNTIME_SESSION_ID || Boolean(sessionId?.startsWith(`${HOST_RUNTIME_SESSION_ID}-`)); }
function buildSidecarProcessEnv(cliEnv, hostEnv = process.env, overrides = {}) { return { ...hostEnv, ...(cliEnv.CODEBUDDY_CONFIG_DIR ? { CODEBUDDY_CONFIG_DIR: cliEnv.CODEBUDDY_CONFIG_DIR } : {}), ...(cliEnv.WORKBUDDY_CONFIG_DIR ? { WORKBUDDY_CONFIG_DIR: cliEnv.WORKBUDDY_CONFIG_DIR } : {}), ...overrides, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }; }
function getHostedCliCwd(sessionId) { return path.join(os.tmpdir(), 'workbuddy-host-cli', sessionId); }
function extractHttpEndpoint(acpEndpoint) { return acpEndpoint.replace(/\/api\/v1\/acp$/, ''); }
function waitForControlPathFree(target, timeoutMs, probeIntervalMs = STALE_PIPE_PROBE_INTERVAL_MS) { const deadline = Date.now() + timeoutMs; return new Promise((resolve) => { const probe = () => { if (Date.now() >= deadline) return resolve(false); const socket = net.createConnection(target); let settled = false; const finalize = (result) => { if (settled) return; settled = true; socket.destroy(); if (result === 'free') resolve(true); else if (result === 'occupied') resolve(false); else setTimeout(probe, probeIntervalMs).unref?.(); }; socket.once('connect', () => finalize('occupied')); socket.once('error', (error) => finalize(error.code === 'ENOENT' || error.code === 'ECONNREFUSED' ? 'free' : 'retry')); }; probe(); }); }
function resolveSidecarBundledAsset(appPath, resourcesPath, ...segments) { const candidates = [resourcesPath && path.join(resourcesPath, 'app.asar.unpacked', 'resources', ...segments), resourcesPath && path.join(resourcesPath, 'app.asar.unpacked', ...segments), path.join(appPath, ...segments), path.join(appPath, 'resources', ...segments), path.join(appPath, '..', 'resources', ...segments), resourcesPath && path.join(resourcesPath, ...segments)]; return candidates.find((candidate) => candidate && fs.existsSync(candidate)); }
module.exports = Object.freeze({ HOST_RUNTIME_SESSION_ID, STALE_PIPE_PROBE_INTERVAL_MS, formatSidecarLogArgs, isExpectedSidecarShutdownLine, isHostedCliRuntimeSessionId, buildSidecarProcessEnv, getHostedCliCwd, extractHttpEndpoint, waitForControlPathFree, resolveSidecarBundledAsset });
