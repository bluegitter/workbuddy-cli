'use strict';
function isSkillUploadSegmentChar(char) { return char === '-' || char === '_' || char === '.' || /\p{L}|\p{N}/u.test(char); }
function normalizeSkillUploadSegment(value) { const trimmed = value.trim(); if (!trimmed) return ''; let result = ''; for (const char of trimmed) result += isSkillUploadSegmentChar(char) ? char : '-'; return result.replace(/^[-._]+|[-._]+$/g, ''); }
function deriveSkillUploadName(baseName, explicitName) { const explicit = explicitName?.trim(); if (explicit) return explicit; return normalizeSkillUploadSegment(baseName) || `custom-skill-${Date.now()}`; }
module.exports = Object.freeze({ normalizeSkillUploadSegment, isSkillUploadSegmentChar, deriveSkillUploadName });
