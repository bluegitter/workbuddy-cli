'use strict';

const OVERSEAS_UNSUPPORTED_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'rtf', 'odt', 'ods', 'odp', 'pages', 'numbers', 'key', 'keynote', 'pdf']);
function extractExtension(nameOrPath) { if (!nameOrPath) return ''; const name = String(nameOrPath).split(/[\\/]/).pop().split(/[?#]/)[0].trim(); const index = name.lastIndexOf('.'); return index <= 0 || index === name.length - 1 ? '' : name.slice(index + 1).toLowerCase(); }
function isUnsupportedOverseasArtifact(nameOrPath) { return OVERSEAS_UNSUPPORTED_EXTENSIONS.has(extractExtension(nameOrPath)); }
function partitionOverseasUnsupportedArtifacts(items, getName = (item) => item?.name || item?.path) { const kept = []; const dropped = []; for (const item of items || []) (isUnsupportedOverseasArtifact(getName(item)) ? dropped : kept).push(item); return { kept, dropped }; }

module.exports = { OVERSEAS_UNSUPPORTED_EXTENSIONS, extractExtension, isUnsupportedOverseasArtifact, partitionOverseasUnsupportedArtifacts };
