'use strict';

const { fileURLToPath } = require('url');
const { isAbsoluteLocalPath } = require('./document-paths');

const LOCALES = Object.freeze({ 'zh-CN': { saveButton: '保存', saveAsButton: '另存为', cancelButton: '取消' }, 'en-US': { saveButton: 'Save', saveAsButton: 'Save As', cancelButton: 'Cancel' } });
const WORD_EXTS = new Set(['doc', 'docx', 'dot', 'dotx', 'docm', 'dotm', 'wps', 'wpt']);
const EXCEL_EXTS = new Set(['xls', 'xlsx', 'xlt', 'xltx', 'xlsm', 'xltm', 'csv']);
const PPT_EXTS = new Set(['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsm', 'pot', 'potx', 'potm', 'dps', 'dpt']);
const OFFICE_EXTS = new Set([...WORD_EXTS, ...EXCEL_EXTS, ...PPT_EXTS]);
const FILE_URI_PATTERN = /file:\/\/[^\s"'<>]+/g;
const MAX_PROMPT_SCAN_DEPTH = 5;
const MAX_PROMPT_STRING_LENGTH = 16384;
const SKIPPED_PROMPT_STRING_KEYS = new Set(['data', 'base64', 'image', 'mimeType', 'thumbnail']);

function isChineseLocale(locale) { return /^(zh|cn)/i.test(String(locale || '')); }
function normalizeMenuLocale(locale) { const value = String(locale || '').trim(); return value === 'zh-CN' || value === 'en-US' ? value : isChineseLocale(value) ? 'zh-CN' : 'en-US'; }
function createMenuLocaleStore(env = process.env) { return { set(locale) { env.WORKBUDDY_MENU_LOCALE = normalizeMenuLocale(locale); }, get() { return env.WORKBUDDY_MENU_LOCALE === 'zh-CN' || env.WORKBUDDY_MENU_LOCALE === 'en-US' ? env.WORKBUDDY_MENU_LOCALE : normalizeMenuLocale(env.LANG || 'en-US'); } }; }
function getRendererTranslation(key, locale = 'en-US', resources = LOCALES) { const value = key.split('.').reduce((current, part) => current && typeof current === 'object' ? current[part] : undefined, resources[normalizeMenuLocale(locale)]); return typeof value === 'string' ? value : key; }
function formatLocalPreviewText(template, values = {}) { return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)).replaceAll(`{${name}}`, String(value)), template); }
function resolveDocArtifactSource(extension) { const ext = String(extension || '').toLowerCase().replace(/^\./, ''); if (WORD_EXTS.has(ext)) return 'word'; if (EXCEL_EXTS.has(ext)) return 'excel'; if (PPT_EXTS.has(ext)) return 'ppt'; if (ext === 'pdf') return 'pdf'; return 'unknown'; }
function extractFileExtension(filePath) { const value = String(filePath || '').split(/[?#]/, 1)[0].replace(/\\/g, '/'); const name = value.slice(value.lastIndexOf('/') + 1); const dot = name.lastIndexOf('.'); return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : ''; }
function hasOfficeExtension(fileName) { return OFFICE_EXTS.has(extractFileExtension(fileName)); }
function normalizeMentionedLocalPath(value) { const trimmed = String(value || '').trim().replace(/[，。；;：:,.!?！？]+$/u, ''); if (!trimmed) return undefined; if (trimmed.startsWith('file://')) { try { return fileURLToPath(trimmed); } catch { return undefined; } } return isAbsoluteLocalPath(trimmed) ? trimmed : undefined; }
function collectPromptStringCandidates(value, depth = 0) { if (depth > MAX_PROMPT_SCAN_DEPTH || value == null) return []; if (typeof value === 'string') return [value.slice(0, MAX_PROMPT_STRING_LENGTH)]; if (Array.isArray(value)) return value.flatMap((item) => collectPromptStringCandidates(item, depth + 1)); if (typeof value !== 'object') return []; return Object.entries(value).flatMap(([key, child]) => SKIPPED_PROMPT_STRING_KEYS.has(key) ? [] : collectPromptStringCandidates(child, depth + 1)); }
function collectMentionedLocalOfficePaths(prompt) {
  const result = []; const seen = new Set(); const add = (raw) => { const filePath = normalizeMentionedLocalPath(raw); if (filePath && hasOfficeExtension(filePath) && !seen.has(filePath)) { seen.add(filePath); result.push(filePath); } };
  for (const text of collectPromptStringCandidates(prompt)) { for (const match of text.matchAll(FILE_URI_PATTERN)) add(match[0]); for (const match of text.matchAll(/@?"((?:[A-Za-z]:[\\/]|\/)[^"\r\n]+)"/g)) add(match[1]); for (const match of text.matchAll(/@?'((?:[A-Za-z]:[\\/]|\/)[^'\r\n]+)'/g)) add(match[1]); for (const match of text.matchAll(/(?:^|[\s([{（【])@?((?:[A-Za-z]:[\\/]|\/)[^\s"'<>]+?\.[A-Za-z0-9]{1,12})(?=$|[\s)\]}）】，。；;：:!?！？])/g)) add(match[1]); }
  return result;
}
function collectMentionedLocalOfficeFileNames(prompt) { const result = []; const seen = new Set(); for (const text of collectPromptStringCandidates(prompt)) for (const match of text.matchAll(/(?:^|[\s"'([{（【])([^\/\\\s"'<>)}\]）】，。；;：:!?！？]+?\.[A-Za-z0-9]{1,12})(?=$|[\s"'）)\]}】，。；;：:!?！？])/g)) { const name = match[1]; if (hasOfficeExtension(name) && !seen.has(name)) { seen.add(name); result.push(name); } } return result; }
function mergeUniquePaths(first = [], second = []) { return [...new Set([...first, ...second])]; }

module.exports = Object.freeze({ EXCEL_EXTS, OFFICE_EXTS, PPT_EXTS, WORD_EXTS, collectMentionedLocalOfficeFileNames, collectMentionedLocalOfficePaths, collectPromptStringCandidates, createMenuLocaleStore, extractFileExtension, formatLocalPreviewText, getRendererTranslation, hasOfficeExtension, isChineseLocale, mergeUniquePaths, normalizeMentionedLocalPath, normalizeMenuLocale, resolveDocArtifactSource });
