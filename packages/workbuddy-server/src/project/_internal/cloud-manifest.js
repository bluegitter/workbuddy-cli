'use strict';
const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');
async function getProjectManifest(http, projectId) { return unwrap(await http.post(`${ROUTE_PREFIX}/manifest/get`, { projectId }), 'get project manifest'); }
async function updateProjectManifest(http, projectId, patch) { return unwrap(await http.post(`${ROUTE_PREFIX}/manifest/update`, { projectId, ...patch }), 'update project manifest'); }
module.exports = Object.freeze({ getProjectManifest, updateProjectManifest });
