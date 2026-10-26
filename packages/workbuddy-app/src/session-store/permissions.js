'use strict';

const { cloneFloatingPermissionRequest } = require('./cloners');
const requestsBySession = new Map();
function setSessionFloatingPermissionRequests(sessionId, requests) { if (sessionId) requestsBySession.set(sessionId, (requests || []).map(cloneFloatingPermissionRequest)); }
function addSessionFloatingPermissionRequest(sessionId, request) { if (!sessionId) return; const current = requestsBySession.get(sessionId) || []; requestsBySession.set(sessionId, [...current, cloneFloatingPermissionRequest(request)]); }
function getSessionFloatingPermissionRequests(sessionId) { return (requestsBySession.get(sessionId) || []).map(cloneFloatingPermissionRequest); }
function clearSessionFloatingPermissionRequests(sessionId) { requestsBySession.delete(sessionId); }

module.exports = Object.freeze({ setSessionFloatingPermissionRequests, addSessionFloatingPermissionRequest, getSessionFloatingPermissionRequests, clearSessionFloatingPermissionRequests });
