'use strict';

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const MEMORY_FILE_NAME = 'MEMORY.md';
const DEFAULT_SOUL_FRONTMATTER = '---\ntitle: "SOUL.md"\nsummary: "AI persona"\n---';
const DEFAULT_SOUL_HEADING = '# SOUL.md - Who You Are';
const NAME_RE = /^[-\s]*(?:\*\*)?(?:Name|name|姓名|名字)(?:\*\*[：:]|[：:])\s*(?:\*\*\s*)?(.+)$/m;
const NAME_CHARS = '\\p{Script=Han}A-Za-z0-9_';

function resolveConfigDir(configDir) { return configDir?.trim() || process.env.WORKBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), process.env.WORKBUDDY_DATA_FOLDER_NAME?.trim() || '.workbuddy'); }
function normalizeParsedName(raw) { const value = raw?.trim() || ''; return !value || /^_\(.*\)_$/.test(value) ? '' : value.replace(/\*\*$/, '').trim(); }
function hasBrokenFrontmatter(content) { if (!/^\s*---\s*(\r?\n)/.test(content)) return false; return !/(^|\r?\n)---\s*(\r?\n|$)/.test(content.replace(/^\s*---\s*(\r?\n)/, '')); }
function parseSoulStructure(content) {
  let rest = content; const match = rest.match(/^\s*---\s*\r?\n[\s\S]*?\r?\n---\s*(\r?\n|$)/); const frontmatter = match ? match[0].replace(/\s+$/, '') : null;
  if (match) rest = rest.slice(match[0].length); const lines = rest.split(/\r?\n/); let index = 0; while (lines[index]?.trim() === '') index += 1;
  const heading = /^#\s+/.test(lines[index] || '') ? lines[index++].trim() : null;
  return { frontmatter, heading, body: lines.slice(index).join('\n').trim() };
}
async function readFileSafe(filePath) { try { return { exists: true, content: await fs.readFile(filePath, 'utf8'), malformed: false }; } catch (error) { return error?.code === 'ENOENT' ? { exists: false, content: '', malformed: false } : { exists: true, content: '', malformed: true }; } }
function toNameField(read) { if (!read.exists) return { exists: false, value: '' }; if (read.malformed) return { exists: true, value: '', malformed: true }; return { exists: true, value: normalizeParsedName(NAME_RE.exec(read.content)?.[1]), ...(hasBrokenFrontmatter(read.content) ? { malformed: true } : {}) }; }
function toSoulField(read) { if (!read.exists) return { exists: false, content: '' }; if (read.malformed) return { exists: true, content: '', malformed: true }; return { exists: true, content: parseSoulStructure(read.content).body, ...(hasBrokenFrontmatter(read.content) ? { malformed: true } : {}) }; }
function toMemoryField(read) { if (!read.exists) return { exists: false, content: '' }; if (read.malformed) return { exists: true, content: '', malformed: true }; return { exists: true, content: read.content.trim() }; }

async function readLocalMemoryFiles(configDir) {
  const dir = resolveConfigDir(configDir); const [identity, user, soul, memory] = await Promise.all(['IDENTITY.md', 'USER.md', 'SOUL.md', MEMORY_FILE_NAME].map((file) => readFileSafe(path.join(dir, file))));
  return { aiName: toNameField(identity), userCallName: toNameField(user), soul: toSoulField(soul), memory: toMemoryField(memory) };
}
async function readNameFrom(filePath) { try { return normalizeParsedName(NAME_RE.exec(await fs.readFile(filePath, 'utf8'))?.[1]); } catch { return ''; } }
async function writeNameField(filePath, name, title) {
  const value = name.trim(); if (!value) throw new Error('name must not be empty'); await fs.mkdir(path.dirname(filePath), { recursive: true }); let existing = ''; try { existing = await fs.readFile(filePath, 'utf8'); } catch {}
  const next = NAME_RE.test(existing) ? existing.replace(NAME_RE, `- **Name:** ${value}`) : existing.trim() ? `${existing}${existing.endsWith('\n') ? '' : '\n'}- **Name:** ${value}\n` : `# ${title}\n\n- **Name:** ${value}\n`;
  await fs.writeFile(filePath, next, 'utf8');
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
async function replaceNameInFile(filePath, from, to) { try { const content = await fs.readFile(filePath, 'utf8'); const re = new RegExp(`(?<![${NAME_CHARS}])${escapeRegExp(from)}(?![${NAME_CHARS}])`, 'gu'); const next = content.replace(re, to); if (next !== content) await fs.writeFile(filePath, next, 'utf8'); } catch {} }
async function syncNameReferences(configDir, oldName, newName) { const from = oldName.trim(), to = newName.trim(); if (!from || !to || from === to || from.includes(to) || to.includes(from)) return; const dir = resolveConfigDir(configDir); await Promise.all(['USER.md', 'IDENTITY.md', 'SOUL.md'].map((file) => replaceNameInFile(path.join(dir, file), from, to))); }
async function writeUserCallName(configDir, name) { const dir = resolveConfigDir(configDir); const file = path.join(dir, 'USER.md'); const oldName = await readNameFrom(file); await writeNameField(file, name, 'USER.md - About Your Human'); await syncNameReferences(configDir, oldName, name); }
async function writeAiName(configDir, name) { const dir = resolveConfigDir(configDir); const file = path.join(dir, 'IDENTITY.md'); const oldName = await readNameFrom(file); await writeNameField(file, name, 'IDENTITY.md - Who Am I?'); await syncNameReferences(configDir, oldName, name); }
async function writeSoulBody(configDir, body) { const dir = resolveConfigDir(configDir); const file = path.join(dir, 'SOUL.md'); await fs.mkdir(dir, { recursive: true }); let existing = ''; try { existing = await fs.readFile(file, 'utf8'); } catch {} const parsed = parseSoulStructure(existing); const head = `${parsed.frontmatter || DEFAULT_SOUL_FRONTMATTER}\n\n${parsed.heading || DEFAULT_SOUL_HEADING}`; await fs.writeFile(file, `${head}${body.trim() ? `\n\n${body.trim()}\n` : '\n'}`, 'utf8'); }
async function writeMemoryBody(configDir, body) { const dir = resolveConfigDir(configDir); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, MEMORY_FILE_NAME), body.trim() ? `${body.trim()}\n` : '', 'utf8'); }

module.exports = { DEFAULT_SOUL_FRONTMATTER, DEFAULT_SOUL_HEADING, MEMORY_FILE_NAME, resolveConfigDir, normalizeParsedName, hasBrokenFrontmatter, parseSoulStructure, readLocalMemoryFiles, readNameFrom, writeUserCallName, writeAiName, writeSoulBody, writeMemoryBody, syncNameReferences };
