'use strict';

const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');
const { resolveSkillUploadFormFieldsFromOptions } = require('../../skill/common/skill-upload-form-fields');

const LOG_TAG = 'ProjectSkill';

function resolveFullUrl(http, route) {
  try {
    const base = http.axiosInstance?.defaults?.baseURL || globalThis.location?.origin;
    return base ? `${String(base).replace(/\/$/, '')}${route.startsWith('/') ? '' : '/'}${route}` : route;
  } catch { return route; }
}
function safeJsonStringify(value) { try { return JSON.stringify(value); } catch { try { return String(value); } catch { return '[unserializable]'; } } }
function writeSkillLog(logWriter, operation, data) { try { logWriter?.append(`${new Date().toISOString().slice(0, 10)}/teams/skills/api.log`, `[${new Date().toISOString()}] [${LOG_TAG}] [${operation}] ${typeof data === 'string' ? data : safeJsonStringify(data)}\n`); } catch {} }
function describeError(error) { return { message: error?.message || String(error), code: error?.code, status: error?.response?.status, responseData: error?.response?.data, url: error?.config?.url, method: error?.config?.method }; }
function describeForm(form) { const fields = {}; try { for (const [key, value] of form.entries()) fields[key] = typeof value === 'string' ? value.slice(0, 200) : { kind: 'file', name: value?.name, size: value?.size, type: value?.type }; } catch (error) { fields.__entriesError = String(error); } return fields; }

async function call(http, route, method, operation, body, logWriter, config) {
  const url = resolveFullUrl(http, route); writeSkillLog(logWriter, `${operation}.req`, { url, method, body });
  try { const response = await http[method.toLowerCase()](route, body, config); const data = unwrap(response, operation); writeSkillLog(logWriter, `${operation}.ok`, { url, response }); return data; }
  catch (error) { writeSkillLog(logWriter, `${operation}.err`, { url, error: describeError(error) }); throw error; }
}

const projectSkillsRoute = (projectId) => `${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/skills`;
const listProjectSkills = (http, projectId, logWriter) => call(http, projectSkillsRoute(projectId), 'GET', 'list project skills', undefined, logWriter);
const listProjectCustomSkills = (http, projectId, logWriter) => call(http, `${projectSkillsRoute(projectId)}/custom`, 'GET', 'list project custom skills', undefined, logWriter);
const addProjectSkill = async (http, projectId, request, logWriter) => (await call(http, projectSkillsRoute(projectId), 'POST', 'add project skill', request, logWriter)).item;
const removeProjectSkill = async (http, projectId, skillId, logWriter) => { await call(http, `${projectSkillsRoute(projectId)}/${encodeURIComponent(skillId)}`, 'DELETE', 'remove project skill', undefined, logWriter); };
const removeProjectCustomSkill = async (http, projectId, skillId, logWriter) => { await call(http, `${projectSkillsRoute(projectId)}/custom/${encodeURIComponent(skillId)}`, 'DELETE', 'remove project custom skill', undefined, logWriter); };
const updateProjectSkills = (http, projectId, request, logWriter) => call(http, projectSkillsRoute(projectId), 'PUT', 'update project skills', request, logWriter);

async function uploadProjectSkill(http, projectId, file, options = {}, logWriter, resolveUploadFile, httpConfig) {
  const fileName = file.name; const blob = resolveUploadFile ? await resolveUploadFile(file) : file;
  const fields = resolveSkillUploadFormFieldsFromOptions({ baseName: fileName.replace(/\.(zip|tar\.gz|tgz|skill)$/i, ''), options });
  const form = new FormData(); form.append('file', blob, fileName); form.append('name', fields.name);
  if (fields.title) form.append('title', fields.title); if (fields.description) form.append('description', fields.description); if (options.sourceId) form.append('source_id', options.sourceId); if (fields.version) form.append('version', fields.version);
  const data = await call(http, `${projectSkillsRoute(projectId)}/custom`, 'POST', 'upload project skill', form, logWriter, httpConfig);
  return { item: data.item };
}
const isFileRef = (file) => Boolean(file && typeof file.filePath === 'string');
const getProjectCustomSkill = async (http, projectId, skillId, logWriter) => ({ item: (await call(http, `${projectSkillsRoute(projectId)}/custom/${encodeURIComponent(skillId)}`, 'GET', 'get project custom skill', undefined, logWriter)).item });

module.exports = { resolveFullUrl, writeSkillLog, safeJsonStringify, describeError, describeForm, listProjectSkills, listProjectCustomSkills, addProjectSkill, removeProjectSkill, removeProjectCustomSkill, updateProjectSkills, uploadProjectSkill, isFileRef, getProjectCustomSkill };
