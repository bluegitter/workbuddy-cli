'use strict';
const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');
const { tryParseMemberQuotaError, isExclusivePlanError, MemberQuotaExceededError, ExclusivePlanNotSupportedError } = require('./quota-errors');
const enc = encodeURIComponent;
async function getProjectJoinEntry(http, projectId) { return unwrap(await http.get(`${ROUTE_PREFIX}/${enc(projectId)}/join-entry`), 'get project join entry'); }
async function submitJoinRequest(http, projectId, params) { return unwrap(await http.post(`${ROUTE_PREFIX}/${enc(projectId)}/join-requests`, params || {}), 'submit join request'); }
async function cancelJoinRequest(http, projectId, requestId) { unwrap(await http.delete(`${ROUTE_PREFIX}/${enc(projectId)}/join-requests/${enc(requestId)}`), 'cancel join request'); }
async function getMyJoinRequest(http, projectId) { return unwrap(await http.get(`${ROUTE_PREFIX}/${enc(projectId)}/join-requests/my`), 'get my join request'); }
async function approveProjectJoinRequest(http, projectId, requestId, currentUid) { try { unwrap(await http.post(`${ROUTE_PREFIX}/${enc(projectId)}/join-requests/${enc(requestId)}/approve`, {}), 'approve project join request'); } catch (error) { const quota = tryParseMemberQuotaError(error, currentUid); if (quota) throw new MemberQuotaExceededError(quota); if (isExclusivePlanError(error)) throw new ExclusivePlanNotSupportedError(); throw error; } }
async function rejectProjectJoinRequest(http, projectId, requestId) { unwrap(await http.post(`${ROUTE_PREFIX}/${enc(projectId)}/join-requests/${enc(requestId)}/reject`, {}), 'reject project join request'); }
const TASK_ROUTE_PREFIX = '/console/as/tasks';
async function getTaskJoinEntry(http, conversationId) { return unwrap(await http.get(`${TASK_ROUTE_PREFIX}/${enc(conversationId)}/join-entry`), 'get task join entry'); }
async function submitTaskJoinRequest(http, conversationId, params) { return unwrap(await http.post(`${TASK_ROUTE_PREFIX}/${enc(conversationId)}/join-requests`, params || {}), 'submit task join request'); }
async function getMyTaskJoinRequest(http, conversationId) { return unwrap(await http.get(`${TASK_ROUTE_PREFIX}/${enc(conversationId)}/join-requests/my`), 'get my task join request'); }
async function approveTaskJoinRequest(http, conversationId, requestId, currentUid) { try { unwrap(await http.post(`${TASK_ROUTE_PREFIX}/${enc(conversationId)}/join-requests/${enc(requestId)}/approve`, {}), 'approve task join request'); } catch (error) { const quota = tryParseMemberQuotaError(error, currentUid); if (quota) throw new MemberQuotaExceededError(quota); if (isExclusivePlanError(error)) throw new ExclusivePlanNotSupportedError(); throw error; } }
async function rejectTaskJoinRequest(http, conversationId, requestId) { unwrap(await http.post(`${TASK_ROUTE_PREFIX}/${enc(conversationId)}/join-requests/${enc(requestId)}/reject`, {}), 'reject task join request'); }
module.exports = { TASK_ROUTE_PREFIX, getProjectJoinEntry, submitJoinRequest, cancelJoinRequest, getMyJoinRequest, approveProjectJoinRequest, rejectProjectJoinRequest, getTaskJoinEntry, submitTaskJoinRequest, getMyTaskJoinRequest, approveTaskJoinRequest, rejectTaskJoinRequest };
