'use strict';
function sanitizeErrorForNotification(error) { const value = String(error); const first = value.split('\n').find((line) => line.trim()) || value; const cleaned = first.replace(/(?:\/(?:Users|root|home|tmp|var|opt|app|data|mnt|private))(?:\/[\w.@+-]+){2,}/g, '<path>').replace(/[A-Z]:\\(?:[\w.-]+\\){2,}[\w.-]*/g, '<path>').trim(); return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned; }
module.exports = { sanitizeErrorForNotification };
