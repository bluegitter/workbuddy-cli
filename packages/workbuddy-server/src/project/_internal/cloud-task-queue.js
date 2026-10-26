'use strict';

class BoxUrlResolver {
  constructor(http) {
    this.http = http;
    this.cache = new Map();
  }

  set(conversationId, sessionInfo) {
    this.cache.set(conversationId, { boxUrl: toBoxUrl(sessionInfo.link), token: sessionInfo.token });
  }

  tryGet(conversationId) {
    return this.cache.get(conversationId);
  }

  async resolve(conversationId) {
    const cached = this.cache.get(conversationId);
    if (cached) return cached;
    const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');
    const info = unwrap(
      await this.http.get(`${ROUTE_PREFIX.replace('/projects', '/conversations')}/${encodeURIComponent(conversationId)}/session`),
      'resolve boxUrl',
    );
    const entry = { boxUrl: toBoxUrl(info.link), token: info.token };
    this.cache.set(conversationId, entry);
    return entry;
  }

  clear(conversationId) {
    if (conversationId) this.cache.delete(conversationId);
    else this.cache.clear();
  }
}

function toBoxUrl(link) {
  return String(link).replace(/\/acp\/?$/, '').replace(/^http:\/\//, 'https://');
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function sandboxRequest(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...authHeaders(token), ...(options.headers || {}) } });
  const json = await response.json();
  if (!response.ok || json.code !== 0) throw new Error(`${options.method || 'GET'} ${url} failed: HTTP ${response.status} code=${json.code} msg=${json.msg}`);
  return json.data;
}

function jsonRequest(method, url, body, token) {
  return sandboxRequest(url, token, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function taskUrl(boxUrl, conversationId, suffix) {
  return `${boxUrl}/tasks/${encodeURIComponent(conversationId)}${suffix}`;
}

const getOnlineStatus = (boxUrl, id, token) => sandboxRequest(taskUrl(boxUrl, id, '/online'), token);
const listTaskQueue = (boxUrl, id, token) => sandboxRequest(taskUrl(boxUrl, id, '/queue'), token);
const removeTaskQueueItem = (boxUrl, id, messageId, version, token) => sandboxRequest(`${taskUrl(boxUrl, id, `/queue/messages/${encodeURIComponent(messageId)}?expected_queue_version=${version}`)}`, token, { method: 'DELETE' });
const reorderTaskQueue = (boxUrl, id, params, token) => jsonRequest('POST', taskUrl(boxUrl, id, '/queue/reorder'), params, token);
const editTaskQueueItem = (boxUrl, id, messageId, params, token) => jsonRequest('PATCH', taskUrl(boxUrl, id, `/queue/messages/${encodeURIComponent(messageId)}`), params, token);
const sendTaskQueueItemNow = (boxUrl, id, messageId, version, token) => jsonRequest('POST', `${taskUrl(boxUrl, id, `/queue/messages/${encodeURIComponent(messageId)}/immediate?expected_queue_version=${version}`)}`, {}, token);
const pauseTaskQueue = (boxUrl, id, token, reason) => jsonRequest('POST', taskUrl(boxUrl, id, '/queue/pause'), reason ? { reason } : {}, token);
const resumeTaskQueue = (boxUrl, id, token) => jsonRequest('POST', taskUrl(boxUrl, id, '/queue/resume'), {}, token);
const relayMessage = async (boxUrl, id, body, token) => { await jsonRequest('POST', `${boxUrl}/conversation/${encodeURIComponent(id)}/relay-message`, body, token); };
const forkQuery = (boxUrl, params, token) => jsonRequest('POST', `${boxUrl}/api/session/fork-query`, params, token);

module.exports = {
  BoxUrlResolver,
  toBoxUrl,
  getOnlineStatus,
  listTaskQueue,
  removeTaskQueueItem,
  reorderTaskQueue,
  editTaskQueueItem,
  sendTaskQueueItemNow,
  pauseTaskQueue,
  resumeTaskQueue,
  relayMessage,
  forkQuery,
};
