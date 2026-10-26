'use strict';

const DEFAULT_SHARE_TITLE = 'Workbuddy Preview';
const SHARE_TASK_FILE_TOO_LARGE_CODE = 10001;

function adaptShareUrl(url, getSharePlatformId = () => undefined) { if (!url) return url; const platform = getSharePlatformId(); return platform ? url.replace(/([?&])platform=\w+/, `$1platform=${platform}`) : url; }
function isShareTaskFileTooLargeError(error) { if (!error) return false; if (typeof error === 'object') return error.code === SHARE_TASK_FILE_TOO_LARGE_CODE || isShareTaskFileTooLargeError(error.msg ?? error.message ?? error.error); return false; }
function buildMessageTimeWindows(messages) { const starts = new Map(); for (const message of messages || []) if (message.requestId && typeof message.createTime === 'number') { const existing = starts.get(message.requestId); if (existing === undefined || message.createTime < existing) starts.set(message.requestId, message.createTime); } const sorted = [...starts.entries()].sort((a, b) => a[1] - b[1]); return sorted.map(([requestId, startedAt], index) => ({ requestId, startedAt, nextStartedAt: sorted[index + 1]?.[1] })); }

module.exports = { DEFAULT_SHARE_TITLE, SHARE_TASK_FILE_TOO_LARGE_CODE, adaptShareUrl, isShareTaskFileTooLargeError, buildMessageTimeWindows };
