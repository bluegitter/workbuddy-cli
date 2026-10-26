'use strict';

const os = require('os');
const path = require('path');
const { ALL_MEDIA_EXTS } = require('./media-extensions');
const { extractPreviewUrlLocalPath } = require('./local-paths');

const IMAGE_TOOL_NAMES = new Set(['imagegen', 'imageedit', 'image_gen', 'image_edit']);
const BASH_TOOL_NAMES = new Set(['Bash', 'bash']);
const ARTIFACT_TOOL_NAMES = new Set(['open_result_view', 'workbuddy_open_result_view', 'present_files', 'workbuddy_present_files']);

function normalizeToolName(toolName) { return typeof toolName === 'string' ? toolName.toLowerCase().replace(/[-\s]/g, '_') : undefined; }
function visitNestedToolResult(rawOutput, visitor) { const visit = (node, depth = 0) => { if (depth > 8 || node == null) return; if (typeof node === 'string') { const value = node.trim(); if (value.startsWith('{') || value.startsWith('[')) { try { visit(JSON.parse(value), depth + 1); } catch {} } return; } if (Array.isArray(node)) return node.forEach((item) => visit(item, depth + 1)); if (typeof node !== 'object') return; visitor(node); Object.values(node).forEach((value) => visit(value, depth + 1)); }; visit(rawOutput); }
function extractImageToolLocalPaths(rawOutput) { const paths = new Set(); visitNestedToolResult(rawOutput, (record) => { if (record.type !== 'image_gen_tool_result' || !Array.isArray(record.images)) return; for (const image of record.images) if (typeof image?.localPath === 'string' && path.isAbsolute(image.localPath)) paths.add(image.localPath); }); return [...paths]; }
function extractArtifactPathsFromEvents(events) {
  const paths = new Set();
  const collect = (node, depth = 0) => { if (depth > 4 || node == null) return; if (Array.isArray(node)) return node.forEach((item) => collect(item, depth + 1)); if (typeof node !== 'object') return; for (const [key, value] of Object.entries(node)) { if (/^(filePath|file_path|targetFile|target_file|path)$/i.test(key) && typeof value === 'string' && path.isAbsolute(value.trim())) paths.add(value.trim()); if (key === 'attachments' && Array.isArray(value)) value.forEach((item) => { if (item && typeof item === 'object') { const filePath = item.filePath ?? item.file_path ?? item.path; if (typeof filePath === 'string' && path.isAbsolute(filePath.trim())) paths.add(filePath.trim()); } }); if (key === 'files' && Array.isArray(value)) value.forEach((item) => { if (typeof item === 'string' && path.isAbsolute(item)) paths.add(item); }); collect(value, depth + 1); } };
  for (const event of events || []) { const update = event?.update; const type = update?.sessionUpdate || event?.type || event?.sessionUpdate; if (!['tool_call', 'tool_call_update', 'tool_result'].includes(type)) continue; const meta = update?._meta || event?._meta || {}; const toolName = normalizeToolName(meta['codebuddy.ai/toolName'] || update?.toolName || update?.toolCall?.toolName || update?.title); if (ARTIFACT_TOOL_NAMES.has(toolName)) { collect(update?.rawInput || event.rawInput); collect(update); } }
  return [...paths];
}
function extractMediaPathsFromCommand(command, cwd) {
  const found = new Set(); const tokens = []; const quoted = /["']([^"'\n]+?)["']/g; let match;
  while ((match = quoted.exec(command || ''))) tokens.push(match[1]);
  for (const part of String(command || '').split(/\s+/)) if (part && !part.startsWith('-') && !part.startsWith('"') && !part.startsWith("'") && (part.includes('/') || part.includes('.'))) tokens.push(part);
  for (const token of tokens) { const resolved = token.startsWith('~/') || token === '~' ? path.join(os.homedir(), token.slice(2)) : path.isAbsolute(token) ? token : cwd ? path.resolve(cwd, token) : undefined; if (!resolved) continue; const extension = path.extname(resolved).slice(1).toLowerCase(); if (ALL_MEDIA_EXTS.has(extension)) found.add(path.normalize(resolved)); }
  return [...found];
}
function extractPreviewUrlLocalMediaPath(url) { const filePath = extractPreviewUrlLocalPath(url); if (!filePath || !ALL_MEDIA_EXTS.has(path.extname(filePath).slice(1).toLowerCase())) return undefined; return filePath; }
function isTerminalToolCallUpdateStatus(status) { return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'canceled'; }

module.exports = Object.freeze({ IMAGE_TOOL_NAMES, BASH_TOOL_NAMES, ARTIFACT_TOOL_NAMES, normalizeToolName, visitNestedToolResult, extractImageToolLocalPaths, extractArtifactPathsFromEvents, extractMediaPathsFromCommand, extractPreviewUrlLocalMediaPath, isTerminalToolCallUpdateStatus });
