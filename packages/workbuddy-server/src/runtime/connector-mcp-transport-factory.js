'use strict';

const { ARDOT_MCP_CONFIG_ID, formatUndiciFetchErrorForLog } = require('./connector-mcp-error-utils');
const { captureResourceMetadataUrl, shouldSkipFallback } = require('./connector-mcp-config');

function buildStdioTransport({ StdioClientTransport, command, args, cwd, env, pipeStderr = false, onStderr }) {
  if (typeof StdioClientTransport !== 'function') throw new Error('StdioClientTransport constructor is unavailable');
  const transport = new StdioClientTransport({ command, args, cwd, env, ...(pipeStderr ? { stderr: 'pipe' } : {}) });
  if (pipeStderr && typeof onStderr === 'function') onStderr(transport);
  return transport;
}

function buildHttpTransportPair({ url, headers = {}, authProvider, StreamableHTTPClientTransport, SSEClientTransport, customFetch, order = 'stream-first' }) {
  const requestInit = { headers: { 'User-Agent': 'WorkBuddy/1.0.0', ...headers } };
  const streamable = () => new StreamableHTTPClientTransport(new URL(url), { authProvider, requestInit, ...(customFetch ? { fetch: customFetch } : {}) });
  const sse = () => new SSEClientTransport(new URL(url), { authProvider, requestInit });
  const streamStep = { name: 'streamableHttp', build: streamable };
  const sseStep = { name: 'sse', build: sse };
  return order === 'sse-first' ? [sseStep, streamStep] : [streamStep, sseStep];
}

async function connectStepWithTimeout({ client, transport, handshakeTimeoutMs, requestTimeoutMs, stepName }) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => { Promise.resolve(transport.close?.()).catch(() => {}); reject(new Error(`${stepName} connect timed out after ${handshakeTimeoutMs}ms (transport handshake hung)`)); }, handshakeTimeoutMs);
    timer.unref?.();
  });
  try { await Promise.race([client.connect(transport, { timeout: requestTimeoutMs }), timeoutPromise]); }
  finally { if (timer) clearTimeout(timer); }
}

async function connectWithFallback({ configId, client, meta, timeout, constructors, onCaptureResourceMetadata, logger = { info() {}, warn() {}, error() {} }, shouldSkip = shouldSkipFallback, handshakeTimeoutMs = 12_000 }) {
  const steps = buildHttpTransportPair({ ...meta, ...constructors });
  const requestTimeoutMs = Math.max(1000, Math.floor(timeout / 2));
  const perStepHandshakeTimeout = Math.min(handshakeTimeoutMs, requestTimeoutMs);
  const [first, second] = steps;
  let firstTransport = first.build(); let firstError;
  try {
    await connectStepWithTimeout({ client, transport: firstTransport, handshakeTimeoutMs: perStepHandshakeTimeout, requestTimeoutMs, stepName: first.name });
    logger.info(`[ConnectorMcpProxy] connectWithFallback(${configId}): ${first.name} OK (primary)`);
    return firstTransport;
  } catch (error) {
    firstError = error instanceof Error ? error.message : String(error);
    onCaptureResourceMetadata?.(configId, firstTransport, captureResourceMetadataUrl);
    if (shouldSkip(error)) throw error;
    await Promise.resolve(firstTransport.close?.()).catch(() => {});
  }
  const secondTransport = second.build();
  try {
    await connectStepWithTimeout({ client, transport: secondTransport, handshakeTimeoutMs: perStepHandshakeTimeout, requestTimeoutMs, stepName: second.name });
    logger.info(`[ConnectorMcpProxy] connectWithFallback(${configId}): ${second.name} OK (fallback)`);
    return secondTransport;
  } catch (error) {
    const secondError = error instanceof Error ? error.message : String(error);
    onCaptureResourceMetadata?.(configId, secondTransport, captureResourceMetadataUrl);
    await Promise.resolve(secondTransport.close?.()).catch(() => {});
    logger.error(`[ConnectorMcpProxy] connectWithFallback(${configId}): both transports failed | ${first.name}: ${firstError} | ${second.name}: ${secondError}`);
    throw new Error(`${first.name} connect failed: ${firstError}; ${second.name} connect failed: ${secondError}`);
  }
}

function createScopedFetch({ fetchFn, dispatcher, requestHeaders = {}, resolveHeaders, logger = { warn() {} }, configId }) {
  return async (input, init = {}) => {
    const scoped = resolveHeaders?.(configId, init.headers, requestHeaders) || { hasScopedHeaders: false, headers: init.headers || requestHeaders };
    try { return await fetchFn(input, { ...init, headers: scoped.headers, ...(dispatcher ? { dispatcher } : {}) }); }
    catch (error) { logger.warn(`[ConnectorMcpProxy] fetch error configId=${configId} target=${typeof input === 'string' ? input : input?.url || '<url-like>'} ${formatUndiciFetchErrorForLog(error)}`); throw error; }
  };
}

module.exports = { buildStdioTransport, buildHttpTransportPair, connectStepWithTimeout, connectWithFallback, createScopedFetch, ARDOT_MCP_CONFIG_ID };
