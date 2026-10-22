'use strict';

const GATEWAY_REQUEST_HEADER = 'X-CodeBuddy-Request';
const GATEWAY_REQUEST_HEADER_VALUE = '1';
const REPLAY_HISTORY_LIMIT = 5000;

function buildSessionReplayRequestHeaders(gatewayHeaders = {}) {
  return { [GATEWAY_REQUEST_HEADER]: GATEWAY_REQUEST_HEADER_VALUE, ...gatewayHeaders };
}
async function parseCliJsonResponse(response) {
  const text = await response.text();
  const bytes = Buffer.byteLength(text, 'utf8');
  const parsed = JSON.parse(text);
  return { data: parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed, bytes };
}
function raceWithSignal(promise, signal, timeoutMessage) {
  if (signal.aborted) return Promise.reject(signal.reason || new Error(timeoutMessage));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new Error(timeoutMessage));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => { signal.removeEventListener('abort', onAbort); resolve(value); }, (error) => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}
async function requestWorkbuddySessionReplay({ runtimeManager, sessionId, fetchFn = fetch, limit = REPLAY_HISTORY_LIMIT, signal, cwd, gatewayHeaders = {} }) {
  const endpointPromise = runtimeManager.getHostEndpoint();
  const endpoint = signal ? await raceWithSignal(endpointPromise, signal, `getHostEndpoint aborted for session "${sessionId}"`) : await endpointPromise;
  const params = new URLSearchParams({ limit: String(limit) });
  if (cwd?.trim()) params.set('cwd', cwd.trim());
  const response = await fetchFn(`${endpoint}/api/v1/sessions/${encodeURIComponent(sessionId)}/replay?${params}`, { headers: buildSessionReplayRequestHeaders(gatewayHeaders), signal });
  if (!response.ok) throw new Error(`Failed to fetch session replay for "${sessionId}": HTTP ${response.status}: ${await response.text().catch(() => response.statusText)}`);
  const parsed = await parseCliJsonResponse(response);
  parsed.data.replayTiming = { ...(parsed.data.replayTiming || {}), bytes: parsed.bytes };
  return parsed.data;
}

module.exports = Object.freeze({ GATEWAY_REQUEST_HEADER, GATEWAY_REQUEST_HEADER_VALUE, REPLAY_HISTORY_LIMIT, buildSessionReplayRequestHeaders, parseCliJsonResponse, raceWithSignal, requestWorkbuddySessionReplay });
