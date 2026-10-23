'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_SCAN_DEPTH = 5;

function disableConnectorSkills(connectorDir, { maxDepth = DEFAULT_MAX_SCAN_DEPTH, logger = { warn() {}, info() {} } } = {}) {
  let marked = 0;
  walkSkillFiles(connectorDir, (file) => {
    try { if (markSkillFileDisabled(file)) marked += 1; }
    catch (error) { logger.warn?.(`[ConnectorSkillState] failed to disable ${file}`, error); }
  }, maxDepth, logger);
  logger.info?.(`[ConnectorSkillState] disabled ${marked} skill file(s) in ${connectorDir}`);
  return marked;
}

function walkSkillFiles(root, callback, maxDepth = DEFAULT_MAX_SCAN_DEPTH, logger = { warn() {} }, depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch (error) { logger.warn?.(`[ConnectorSkillState] readdir failed: ${root}`, error); return; }
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) walkSkillFiles(file, callback, maxDepth, logger, depth + 1);
    else if (entry.isFile() && entry.name === 'SKILL.md') callback(file);
  }
}

function markSkillFileDisabled(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return false;
  const frontmatter = match[1];
  const disableLine = /^disable\s*:/m;
  if (disableLine.test(frontmatter)) {
    const updated = frontmatter.replace(/^disable\s*:.+$/m, 'disable: true');
    if (updated === frontmatter) return true;
    fs.writeFileSync(filePath, `---\n${updated}\n---\n${source.slice(match[0].length)}`, 'utf8');
    return true;
  }
  fs.writeFileSync(filePath, `---\n${frontmatter}\ndisable: true\n---\n${source.slice(match[0].length)}`, 'utf8');
  return true;
}

module.exports = { DEFAULT_MAX_SCAN_DEPTH, disableConnectorSkills, markSkillFileDisabled, walkSkillFiles };
