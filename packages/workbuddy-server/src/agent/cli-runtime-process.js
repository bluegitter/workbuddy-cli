'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const AGENT_CLI_LOCAL_ACP_ENDPOINT_UNAVAILABLE_CODE = 'AGENT_UNAVAILABLE';
/** Classify process exits so launch failures can be reported separately from agent errors. */
function classifyCliExit(exitCode) {
  const code = Number(exitCode) >>> 0;
  if (exitCode === 127 || exitCode === 126 || code === 9009 || code === 1073807364) return 'startup-failed';
  if (code >= 3221225472 && code <= 3489660927) return 'startup-failed';
  return 'ran-with-error';
}
function writeAgentCliSystemPromptFile(sessionId, systemPrompt) {
  if (!systemPrompt) return null;
  const tmpDir = path.join(os.tmpdir(), 'workbuddy-prompts');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `${sessionId}.prompt.txt`);
  fs.writeFileSync(filePath, systemPrompt, 'utf8');
  return filePath;
}
function cleanupAgentCliSystemPromptFile(filePath) { if (filePath) try { fs.unlinkSync(filePath); } catch {} }
function createAgentCliLocalAcpEndpointUnavailableError(endpoint, timeoutMs, attempts, elapsedMs, logPrefix = '[CodeBuddyCodeBackend]') {
  const error = new Error(`${logPrefix} Local ACP endpoint ${endpoint} not reachable after ${timeoutMs}ms`);
  error.code = AGENT_CLI_LOCAL_ACP_ENDPOINT_UNAVAILABLE_CODE;
  error.data = { endpoint, timeoutMs, attempts, elapsedMs };
  return error;
}
async function waitForAgentCliLocalAcpEndpoint(acpEndpoint, options = {}) {
  const port = Number(acpEndpoint.match(/:(\d+)/)?.[1]);
  if (!port) return;
  const timeoutMs = options.timeoutMs ?? 180000;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let lastErr;
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    attempts += 1;
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => { socket.destroy(); resolve(true); });
      socket.on('error', (error) => { lastErr = error.code || error.message; socket.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  const elapsedMs = Date.now() - startedAt;
  options.logger?.error?.(`${options.logPrefix || '[CodeBuddyCodeBackend]'} waitForPort timeout port=${port} attempts=${attempts} elapsed=${elapsedMs}ms lastErr=${lastErr || 'none'}`);
  throw createAgentCliLocalAcpEndpointUnavailableError(acpEndpoint, timeoutMs, attempts, elapsedMs, options.logPrefix);
}

module.exports = Object.freeze({ AGENT_CLI_LOCAL_ACP_ENDPOINT_UNAVAILABLE_CODE, classifyCliExit, writeAgentCliSystemPromptFile, cleanupAgentCliSystemPromptFile, waitForAgentCliLocalAcpEndpoint, createAgentCliLocalAcpEndpointUnavailableError });
