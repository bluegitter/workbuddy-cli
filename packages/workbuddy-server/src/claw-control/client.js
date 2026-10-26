'use strict';
const { CLAW_CHANNEL_TYPES } = require('../claw/claw-types');
const { FAIL_OPEN_CLAW_CONTROL_SNAPSHOT } = require('./types');
const CLAW_CONTROL_PATH_TEMPLATE = '/v2/enterprises/{enterpriseId}/claw/control';
const CLAW_CONTROL_FETCH_TIMEOUT_MS = 1500;
const CHANNEL_TYPE_SET = new Set(CLAW_CHANNEL_TYPES);
function isChannelState(value) { return value === 'usable' || value === 'disabled'; }
function toChannelsMap(input) { if (!input || typeof input !== 'object') return {}; return Object.fromEntries(Object.entries(input).filter(([key, value]) => CHANNEL_TYPE_SET.has(key) && isChannelState(value))); }
function parseClawControlSnapshot(payload) { if (!payload || typeof payload !== 'object') return { ...FAIL_OPEN_CLAW_CONTROL_SNAPSHOT }; return { loaded: true, masterEnabled: payload.masterEnabled !== false, channels: toChannelsMap(payload.channels) }; }
async function fetchClawControlSnapshot(restOperations, enterpriseId) { const path = CLAW_CONTROL_PATH_TEMPLATE.replace('{enterpriseId}', encodeURIComponent(enterpriseId)); let response; try { response = await restOperations.get(path, { timeout: CLAW_CONTROL_FETCH_TIMEOUT_MS }); } catch { return undefined; } if (response?.status !== undefined && response.status !== 200) return undefined; const data = response?.data?.data ?? response?.data; return data && typeof data === 'object' ? parseClawControlSnapshot(data) : undefined; }
module.exports = Object.freeze({ CLAW_CONTROL_PATH_TEMPLATE, CLAW_CONTROL_FETCH_TIMEOUT_MS, isChannelState, toChannelsMap, parseClawControlSnapshot, fetchClawControlSnapshot });
