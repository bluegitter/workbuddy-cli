'use strict';
const TASKS_PREFIX = '/console/as/tasks'; const CONVERSATIONS_PREFIX = '/console/as/conversations';
const enc = encodeURIComponent;
async function listConversationMembers(http, conversationId) { return require('../../runtime/http-contract').unwrap(await http.get(`${CONVERSATIONS_PREFIX}/${enc(conversationId)}/members`), 'list conversation members'); }
async function directInviteTaskCollaborator(http, conversationId, projectId, inviteeUid) { return require('../../runtime/http-contract').unwrap(await http.post(`${TASKS_PREFIX}/${enc(conversationId)}/collaboration/invite`, { projectId, inviteeUid }), 'direct invite task collaborator'); }
async function createTaskInviteLink(http, conversationId, expiresIn) { return require('../../runtime/http-contract').unwrap(await http.post(`${TASKS_PREFIX}/${enc(conversationId)}/collaboration/invite-link`, expiresIn == null ? {} : { expiresIn }), 'create task invite link'); }
async function removeTaskCollaborator(http, conversationId, uid) { return require('../../runtime/http-contract').unwrap(await http.delete(`${CONVERSATIONS_PREFIX}/${enc(conversationId)}/members/${enc(uid)}`), 'remove conversation member'); }
module.exports = { TASKS_PREFIX, CONVERSATIONS_PREFIX, listConversationMembers, directInviteTaskCollaborator, createTaskInviteLink, removeTaskCollaborator };
