'use strict';

const SHARE_MODERATION_SCENE = 'nickname';
const INFRA_ERROR_PATTERNS = [
  'network_error',
  'network_timeout',
  'enotfound',
  'eai_again',
  'econnrefused',
  'econnreset',
  'econnaborted',
  'etimedout',
  'err_network',
  'timeout',
  'moderation endpoint not deployed',
  'fetch failed',
  'failed to fetch',
  'load failed',
];

function isInfraError(error) {
  if (typeof error !== 'string') return false;
  const normalized = error.toLowerCase();
  return INFRA_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function normalizeModerationResult(result, text) {
  if (result.pass) return { pass: true };
  if (isInfraError(result.error)) {
    return { pass: false, reason: 'serviceUnavailable', blockedText: text, error: result.error };
  }
  return { pass: false, reason: 'blocked', blockedText: text, error: result.error };
}

async function probeShareText(adapter, text) {
  const trimmed = text.trim();
  if (!trimmed || !adapter?.checkModeration) return { pass: true };
  try {
    return normalizeModerationResult(await adapter.checkModeration({
      text: trimmed,
      scene: SHARE_MODERATION_SCENE,
    }), trimmed);
  } catch (error) {
    return { pass: false, reason: 'serviceUnavailable', blockedText: trimmed, error: String(error) };
  }
}

async function checkShareTextsModeration(adapter, texts) {
  const normalizedTexts = texts.map((text) => text.trim()).filter(Boolean);
  if (normalizedTexts.length === 0 || !adapter?.checkModeration) return { pass: true };
  const combinedText = normalizedTexts.join('\n');
  const combinedResult = await probeShareText(adapter, combinedText);
  if (combinedResult.pass) return { pass: true };
  if (combinedResult.reason === 'serviceUnavailable') return combinedResult;
  for (const text of normalizedTexts) {
    const singleResult = await probeShareText(adapter, text);
    if (!singleResult.pass) return singleResult;
  }
  return { pass: false, reason: 'blocked', blockedText: combinedText, error: combinedResult.error };
}

module.exports = {
  SHARE_MODERATION_SCENE,
  INFRA_ERROR_PATTERNS,
  isInfraError,
  normalizeModerationResult,
  probeShareText,
  checkShareTextsModeration,
};
