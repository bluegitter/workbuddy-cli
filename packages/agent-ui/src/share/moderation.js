'use strict';

const INFRA_ERROR_PATTERNS = ['network_error', 'network_timeout', 'enotfound', 'eai_again', 'econnrefused', 'econnreset', 'econnaborted', 'etimedout', 'err_network', 'timeout', 'moderation endpoint not deployed', 'fetch failed', 'failed to fetch', 'load failed'];
function isInfraError(error) { if (typeof error !== 'string') return false; const normalized = error.toLowerCase(); return INFRA_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern)); }
function normalizeModerationResult(result, text) { if (result?.pass) return { pass: true }; return { pass: false, reason: isInfraError(result?.error) ? 'serviceUnavailable' : 'blocked', blockedText: text, error: result?.error }; }
async function probeShareText(adapter, text) { try { return normalizeModerationResult(await adapter.checkTextModeration(text), text); } catch (error) { return normalizeModerationResult({ pass: false, error: error.message || String(error) }, text); } }
async function checkShareTextsModeration(adapter, texts) { const results = []; for (const text of texts || []) { const result = await probeShareText(adapter, text); results.push(result); if (!result.pass && result.reason === 'blocked') return { pass: false, results }; } return { pass: true, results }; }

module.exports = { INFRA_ERROR_PATTERNS, isInfraError, normalizeModerationResult, probeShareText, checkShareTextsModeration };
