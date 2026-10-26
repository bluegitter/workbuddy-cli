'use strict';

const SINGLE_FILE_KNOWLEDGE_EXTENSIONS = new Set(['html', 'htm']);
const TASK_KNOWLEDGE_EXTENSIONS = new Set(['html', 'htm', 'md', 'markdown', 'csv']);
function getExtension(filePath) { const value = String(filePath || '').split(/[?#]/)[0].split(/[\\/]/).pop(); const index = value.lastIndexOf('.'); return index > 0 ? value.slice(index + 1).toLowerCase() : ''; }
function isSingleFileKnowledgeArtifact(filePath) { return SINGLE_FILE_KNOWLEDGE_EXTENSIONS.has(getExtension(filePath)); }
function isTaskKnowledgeArtifact(filePath) { return TASK_KNOWLEDGE_EXTENSIONS.has(getExtension(filePath)); }

module.exports = { SINGLE_FILE_KNOWLEDGE_EXTENSIONS, TASK_KNOWLEDGE_EXTENSIONS, getExtension, isSingleFileKnowledgeArtifact, isTaskKnowledgeArtifact };
