'use strict';
const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');
const enc = encodeURIComponent;
async function listProjectExperts(http, projectId) { return unwrap(await http.get(`${ROUTE_PREFIX}/${enc(projectId)}/experts`), 'list project experts'); }
async function addProjectExpert(http, projectId, request) { return unwrap(await http.post(`${ROUTE_PREFIX}/${enc(projectId)}/experts`, request), 'add project expert').item; }
async function removeProjectExpert(http, projectId, expertId) { unwrap(await http.delete(`${ROUTE_PREFIX}/${enc(projectId)}/experts/${enc(expertId)}`), 'remove project expert'); }
async function removeProjectCustomExpert(http, projectId, expertId) { unwrap(await http.delete(`${ROUTE_PREFIX}/${enc(projectId)}/experts/custom/${enc(expertId)}`), 'remove project custom expert'); }
async function updateProjectExperts(http, projectId, request) { return unwrap(await http.put(`${ROUTE_PREFIX}/${enc(projectId)}/experts`, request), 'update project experts'); }
async function listProjectCustomExperts(http, projectId) { return unwrap(await http.get(`${ROUTE_PREFIX}/${enc(projectId)}/experts/custom`), 'list project custom experts'); }
async function getProjectCustomExpertDownloadUrl(http, projectId, expertId) { return unwrap(await http.get(`${ROUTE_PREFIX}/${enc(projectId)}/experts/custom/${enc(expertId)}/download-url`), 'get project custom expert download url'); }
async function uploadProjectCustomExpert(http, projectId, file, options = {}, resolveUploadFile, httpConfig) { const blob = resolveUploadFile ? await resolveUploadFile(file) : file; const form = new FormData(); form.append('file', blob, file.name || 'expert.zip'); form.append('name', options.name || (file.name || 'expert.zip').replace(/\.zip$/i, '')); if (options.description) form.append('description', options.description); if (options.sourceId) form.append('sourceId', options.sourceId); if (options.icon) form.append('icon', options.icon); return unwrap(await http.post(`${ROUTE_PREFIX}/${enc(projectId)}/experts/custom`, form, httpConfig), 'upload project custom expert'); }
module.exports = { listProjectExperts, addProjectExpert, removeProjectExpert, removeProjectCustomExpert, updateProjectExperts, listProjectCustomExperts, getProjectCustomExpertDownloadUrl, uploadProjectCustomExpert };
