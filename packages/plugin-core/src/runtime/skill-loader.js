'use strict';

const fs = require('fs');
const path = require('path');

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---')) return { attributes: {}, body: markdown };
  const end = markdown.indexOf('\n---', 3);
  if (end < 0) return { attributes: {}, body: markdown };
  const attributes = {};
  for (const line of markdown.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (match) attributes[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return { attributes, body: markdown.slice(end + 4).trimStart() };
}

function loadSkill(directory) {
  const file = path.join(directory, 'SKILL.md');
  const parsed = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  return { directory, file, ...parsed, name: parsed.attributes.name || path.basename(directory) };
}

function discoverSkills(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md')))
    .map((entry) => loadSkill(path.join(root, entry.name)));
}

module.exports = { discoverSkills, loadSkill, parseFrontmatter };
