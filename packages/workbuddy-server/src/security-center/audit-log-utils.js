'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (isRecord(value)) return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function sha256Hex(content) { return crypto.createHash('sha256').update(content).digest('hex'); }
function hashEntry(entry) { const { hash: _hash, ...rest } = entry; return sha256Hex(stableStringify(rest)); }
function commandHash(command) { return sha256Hex(command); }
async function fileSha256(filePath) { return sha256Hex(await fs.readFile(filePath)); }
function parseSegmentIndex(fileName) { const match = path.basename(fileName).match(/^\d{4}-\d{2}-\d{2}(?:\.(\d+))?\.jsonl$/); return match?.[1] ? Number(match[1]) : 0; }
function compareSegmentFiles(a, b) { const left = path.basename(a); const right = path.basename(b); return left.slice(0, 10).localeCompare(right.slice(0, 10)) || parseSegmentIndex(left) - parseSegmentIndex(right); }
module.exports = Object.freeze({ isRecord, stableStringify, sha256Hex, hashEntry, commandHash, fileSha256, parseSegmentIndex, compareSegmentFiles });
