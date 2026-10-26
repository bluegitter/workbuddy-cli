'use strict';
const COMMAND_ALIASES = Object.freeze([{ kind: 'clear', aliases: ['/clear', '/清空'] }, { kind: 'compact', aliases: ['/compact', '/总结'] }]);
function matchSlashCommand(text) { if (typeof text !== 'string') return null; const trimmed = text.trim(); if (!trimmed.startsWith('/')) return null; const lower = trimmed.toLowerCase(); for (const { kind, aliases } of COMMAND_ALIASES) for (const alias of aliases) if (alias === lower || alias === trimmed) return { kind, token: alias }; return null; }
const SLASH_COMMAND_REWRITE = Object.freeze({ clear: {}, compact: {} });
module.exports = { COMMAND_ALIASES, matchSlashCommand, SLASH_COMMAND_REWRITE };
