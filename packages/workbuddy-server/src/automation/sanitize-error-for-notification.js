'use strict';
function sanitizeErrorForNotification(error) { const value = String(error); const line = value.split('\n').find((item) => item.trim()) || value; const cleaned = line.replace(/(?:\/(?:Users|root|home|tmp|var|opt|app|data|mnt|private))(?:\/[\w.@+-]+){2,}/g, '<path>').replace(/[A-Z]:\\(?:[\w.-]+\\){2,}[\w.-]*/g, '<path>').trim(); return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned; }
module.exports = Object.freeze({ sanitizeErrorForNotification });
