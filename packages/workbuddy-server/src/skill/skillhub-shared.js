'use strict';

const SKILLHUB_BASE_URL = 'https://api.skillhub.cn';
const SKILLHUB_API_KEY_HEADER = 'X-API-Key';
function buildSkillHubHeaders(extra, apiKey) { const headers = { ...(extra ?? {}) }; const key = apiKey?.trim(); if (key) headers[SKILLHUB_API_KEY_HEADER] = key; return headers; }

module.exports = Object.freeze({ SKILLHUB_BASE_URL, SKILLHUB_API_KEY_HEADER, buildSkillHubHeaders });
