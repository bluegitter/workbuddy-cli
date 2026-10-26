'use strict';
function encodePath(value) { return encodeURIComponent(String(value)); }
function safeParseBigIntJSON(text) { return JSON.parse(text.replace(/:(\s*)(\d{16,})(\s*[,}\]])/g, (_full, before, number, after) => `:${before}"${number}"${after}`)); }
module.exports = Object.freeze({ encodePath, safeParseBigIntJSON });
