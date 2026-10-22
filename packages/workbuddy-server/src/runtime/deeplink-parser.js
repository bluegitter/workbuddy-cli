'use strict';

const MAX_PROMPT_LENGTH = 8000;
const VALID_PERMISSION_MODES = new Set(['default', 'fullAccess']);
const VALID_WELCOME_MODES = new Set(['coding', 'working', 'design']);

function parseTaskUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  const protocol = url.protocol.toLowerCase();
  if (protocol === 'http:' || protocol === 'https:') return null;
  return url.hostname.toLowerCase() === 'task' ? url : null;
}

function firstParam(params, key) {
  const value = params.get(key);
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseCommaList(raw, warnings, field) {
  if (!raw) return undefined;
  const items = Array.from(new Set(raw.split(',').map((item) => item.trim()).filter(Boolean)));
  if (!items.length) return undefined;
  if (items.length > 20) {
    warnings.push(`${field} 数量超过上限 20，已截断`);
    return items.slice(0, 20);
  }
  return items;
}

function parseJsonArrayParam(raw, warnings, field) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length ? parsed : undefined;
    warnings.push(`${field} 不是数组，已忽略`);
  } catch { warnings.push(`${field} JSON 解析失败，已忽略`); }
  return undefined;
}

function parseDeeplink(rawUrl) {
  const url = parseTaskUrl(rawUrl);
  if (!url) return { ok: false, reason: 'not-task-protocol', message: '非 task deeplink 协议' };
  const params = url.searchParams;
  const action = (firstParam(params, 'action') || '').toLowerCase();
  if (action !== 'start') return { ok: false, reason: 'invalid-action', message: `不支持的 action: ${action || '(缺失)'}` };
  const warnings = [];
  const payloadId = firstParam(params, 'payloadId');
  let prompt = firstParam(params, 'prompt');
  if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
    warnings.push(`prompt 超过 ${MAX_PROMPT_LENGTH} 字符，已截断（长内容应走 payloadId）`);
    prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
  }
  const promptContentBlocks = parseJsonArrayParam(firstParam(params, 'promptContentBlocks'), warnings, 'promptContentBlocks');
  if (!payloadId && !prompt && !promptContentBlocks) return { ok: false, reason: 'missing-required', message: 'payloadId、prompt 与 promptContentBlocks 至少需要一个' };
  let permissionMode;
  const rawPermissionMode = firstParam(params, 'permissionMode');
  if (rawPermissionMode) {
    if (VALID_PERMISSION_MODES.has(rawPermissionMode)) permissionMode = rawPermissionMode;
    else { warnings.push(`permissionMode "${rawPermissionMode}" 非法，降级为 default`); permissionMode = 'default'; }
  }
  let welcomeMode;
  const rawWelcomeMode = firstParam(params, 'welcomeMode');
  if (rawWelcomeMode) {
    if (VALID_WELCOME_MODES.has(rawWelcomeMode)) welcomeMode = rawWelcomeMode;
    else warnings.push(`welcomeMode "${rawWelcomeMode}" 非法，已忽略`);
  }
  return { ok: true, value: {
    domain: 'task', action: 'start', payloadId, prompt, promptContentBlocks,
    cwd: firstParam(params, 'cwd'), expertId: firstParam(params, 'expertId'),
    skills: parseCommaList(firstParam(params, 'skills'), warnings, 'skills'),
    connectorIds: parseCommaList(firstParam(params, 'connectorIds'), warnings, 'connectorIds'),
    model: firstParam(params, 'model'), mode: firstParam(params, 'mode'), welcomeMode, permissionMode,
  }, warnings };
}

module.exports = { MAX_PROMPT_LENGTH, VALID_PERMISSION_MODES, VALID_WELCOME_MODES, firstParam, parseCommaList, parseDeeplink, parseJsonArrayParam, parseTaskUrl };
