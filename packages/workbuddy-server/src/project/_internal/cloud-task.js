'use strict';

const { ROUTE_PREFIX, buildQuery, unwrap } = require('../../runtime/http-contract');

const CONVERSATIONS_PREFIX = '/console/as/conversations';
const HANDOFF_PRIORITY_TEXT_TO_CODE = Object.freeze({ urgent: 1, high: 2, medium: 3, low: 4 });

async function createTask(http, params) {
  const body = { projectId: params.projectId, name: params.name, prompt: params.prompt, model: params.model };
  if (params.language) body.language = params.language;
  if (params.tags?.length) body.tags = params.tags;
  return unwrap(await http.post(`${CONVERSATIONS_PREFIX}/`, body), 'create task');
}

async function listTasks(http, projectId, params) {
  return unwrap(await http.get(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/conversations${buildQuery(params)}`), 'list tasks');
}

async function handoffTask(http, conversationId, params) {
  const body = { summary: params.summary };
  if (params.toUserId) body.to_user_id = params.toUserId;
  if (params.title) body.title = params.title;
  if (params.note) body.note = params.note;
  if (typeof params.deadlineAt === 'number') body.deadline_at = params.deadlineAt;
  if (params.statusId) body.status_id = params.statusId;
  const priorityCode = HANDOFF_PRIORITY_TEXT_TO_CODE[params.priority ?? ''];
  if (priorityCode) body.priority = priorityCode;
  else if (params.priority) body.priority_text = params.priority;
  if (params.tags?.length) body.tags = params.tags;
  if (typeof params.startedAt === 'number') body.start_date = params.startedAt;
  const data = unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(conversationId)}/handoff`, body), 'handoff task');
  return { todoId: data.todo_id ?? data.todoId ?? '' };
}

const connectTask = async (http, id) => unwrap(await http.get(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}/session`), 'connect task');
const updateTaskTitle = async (http, id, title) => { unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}`, { title }), 'update task title'); };
const setConversationStatus = async (http, id, status) => { unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}`, { status }), 'set conversation status'); };
const archiveTask = async (http, id) => { unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}/archive`, {}), 'archive task'); };
const deleteTask = async (http, id) => { unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}/delete`, {}), 'delete task'); };
const leaveConversation = async (http, id) => { unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}/leave`, {}), 'leave conversation'); };

async function switchExpert(http, conversationId, params) {
  const body = { expertId: params.expertId };
  if (params.locale) body.locale = params.locale;
  unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(conversationId)}`, body), 'switch expert');
}

const forkConversation = async (http, id) => unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}/fork`, {}), 'fork conversation');

async function getConversationDetail(http, conversationId) {
  const detail = unwrap(await http.get(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(conversationId)}`), 'get conversation detail');
  if (!detail.expertId || !detail.locale) {
    for (const env of detail.manifest?.envs || []) {
      if (!env || typeof env.key !== 'string') continue;
      if (env.key === 'X_EXPERT_ID' && !detail.expertId) detail.expertId = typeof env.value === 'string' ? env.value : undefined;
      if (env.key === 'X_EXPERT_LOCALE' && !detail.locale) detail.locale = typeof env.value === 'string' ? env.value : undefined;
    }
  }
  return detail;
}

const syncAgent = async (http, id) => unwrap(await http.post(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}/sync-agent`, {}), 'sync agent');
const fetchTimeline = async (http, id) => (unwrap(await http.get(`${CONVERSATIONS_PREFIX}/${encodeURIComponent(id)}/timeline`), 'fetch timeline') ?? []);

module.exports = {
  HANDOFF_PRIORITY_TEXT_TO_CODE,
  createTask,
  listTasks,
  handoffTask,
  connectTask,
  updateTaskTitle,
  setConversationStatus,
  archiveTask,
  deleteTask,
  leaveConversation,
  switchExpert,
  forkConversation,
  getConversationDetail,
  syncAgent,
  fetchTimeline,
};
