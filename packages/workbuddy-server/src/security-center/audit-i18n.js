'use strict';
function interpolate(template, params) { return template.replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match); }
function renderAuditEntryText(locale, entry, translate) { if (!entry.messageKey) return ''; const params = {}; for (const [key, value] of Object.entries(entry.messageParams ?? {})) params[key.endsWith('Key') && typeof value === 'string' ? key.slice(0, -3) : key] = key.endsWith('Key') && typeof value === 'string' ? translate?.(locale, value) ?? value : value; return interpolate(translate?.(locale, entry.messageKey) ?? entry.messageKey, params); }
function pickAuditExportLocale(systemLocale) { return /^(zh|cn)/i.test(systemLocale) ? 'zh-cn' : 'en'; }
module.exports = Object.freeze({ interpolate, renderAuditEntryText, pickAuditExportLocale });
