'use strict';
function isClawWorkspacePath(cwd) { if (!cwd) return false; const normalized = cwd.replace(/\\/g, '/'); return /(?:^|\/)claw(?:\/|$)/i.test(normalized) || /(?:^|\/)automation-claw-/i.test(normalized); }
module.exports = Object.freeze({ isClawWorkspacePath });
