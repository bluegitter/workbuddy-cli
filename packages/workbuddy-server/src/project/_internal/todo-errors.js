'use strict';
const TODO_ERROR_CODES = Object.freeze({ notFound: 17301 });
class TodoNotFoundError extends Error { constructor(message = 'Todo not found') { super(message); this.name = 'TodoNotFoundError'; this.code = TODO_ERROR_CODES.notFound; } }
function collectErrorMessages(reason) { if (typeof reason === 'string') return [reason]; if (!reason || typeof reason !== 'object') return reason instanceof Error ? [reason.message] : []; return [reason.message, reason.response?.data?.message, reason.response?.data?.msg, ...(Array.isArray(reason.details) ? reason.details : [])].filter((item) => typeof item === 'string' && item.trim()); }
function extractErrorCode(reason) { if (!reason || typeof reason !== 'object') return undefined; const code = reason.code ?? reason.response?.data?.code; return typeof code === 'number' || typeof code === 'string' ? code : undefined; }
function isTodoNotFoundError(reason) { return reason instanceof TodoNotFoundError || extractErrorCode(reason) === TODO_ERROR_CODES.notFound || extractErrorCode(reason) === String(TODO_ERROR_CODES.notFound) || collectErrorMessages(reason).some((message) => /todo not found|get todo returned empty todo/i.test(message)); }
module.exports = Object.freeze({ TODO_ERROR_CODES, TodoNotFoundError, collectErrorMessages, extractErrorCode, isTodoNotFoundError });
