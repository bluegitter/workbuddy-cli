'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { deriveSkillUploadName } = require('./skill-upload-slug');

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

function parseSimpleFrontmatter(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}
function pickDescription(frontmatter) { for (const key of ['description', 'description_zh', 'description_en']) if (typeof frontmatter[key] === 'string' && frontmatter[key].trim()) return frontmatter[key].trim(); }
function parseSkillMdMetadataFromContent(content, fallbackTitle) {
  const match = FRONTMATTER_RE.exec(String(content || ''));
  if (!match) return fallbackTitle ? { title: fallbackTitle } : null;
  const frontmatter = parseSimpleFrontmatter(match[1]);
  const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
  const description = pickDescription(frontmatter);
  const title = String(fallbackTitle || '').trim() || undefined;
  return name || description || title ? { name: name || undefined, title, description } : null;
}
function readSkillUploadMetadataFromDir(skillRootDir, fallbackTitle) {
  try { const file = path.join(skillRootDir, 'SKILL.md'); return fs.existsSync(file) ? parseSkillMdMetadataFromContent(fs.readFileSync(file, 'utf8'), fallbackTitle) : (fallbackTitle ? { title: fallbackTitle } : null); } catch { return fallbackTitle ? { title: fallbackTitle } : null; }
}
function readSkillUploadMetadataFromZipPath(zipPath, fallbackTitle) {
  try { const AdmZip = require('adm-zip'); return readSkillUploadMetadataFromZipEntries(new AdmZip(zipPath), fallbackTitle); } catch { return fallbackTitle ? { title: fallbackTitle } : null; }
}
function readSkillUploadMetadataFromBuffer(data, fallbackTitle) {
  try { const AdmZip = require('adm-zip'); return readSkillUploadMetadataFromZipEntries(new AdmZip(data), fallbackTitle); } catch { return fallbackTitle ? { title: fallbackTitle } : null; }
}
function readSkillUploadMetadataFromZipEntries(zip, fallbackTitle) {
  const entry = zip.getEntries().find((item) => !item.isDirectory && /(^|\/)SKILL\.md$/i.test(item.entryName.replace(/\\/g, '/')));
  return entry ? parseSkillMdMetadataFromContent(entry.getData().toString('utf8'), fallbackTitle) : (fallbackTitle ? { title: fallbackTitle } : null);
}
function mergeSkillUploadMetadata(baseName, options, fromSkillMd) { return { name: options?.name?.trim() || fromSkillMd?.name?.trim(), title: options?.title?.trim() || fromSkillMd?.title?.trim() || String(baseName || '').trim(), description: options?.description?.trim() || fromSkillMd?.description?.trim() }; }
async function resolveSkillUploadFormFields({ baseName, blob, filePath, options } = {}) {
  let metadata = null;
  if (!options?.name?.trim()) metadata = filePath?.toLowerCase().endsWith('.zip') ? readSkillUploadMetadataFromZipPath(filePath, baseName) : blob ? readSkillUploadMetadataFromBuffer(await blob.arrayBuffer().then(Buffer.from), baseName) : null;
  const merged = mergeSkillUploadMetadata(baseName, options, metadata);
  return { name: deriveSkillUploadName(baseName, merged.name), title: merged.title, description: merged.description, version: options?.version, derivedSlug: deriveSkillUploadName(baseName) };
}
async function enrichSkillUploadOptions(params) { if (params.options?.name?.trim()) return params.options; const fields = await resolveSkillUploadFormFields(params); return { ...params.options, name: fields.name, title: fields.title, description: fields.description, version: fields.version }; }

module.exports = { FRONTMATTER_RE, parseSkillMdMetadataFromContent, readSkillUploadMetadataFromDir, readSkillUploadMetadataFromZipPath, readSkillUploadMetadataFromBuffer, readSkillUploadMetadataFromZipEntries, mergeSkillUploadMetadata, resolveSkillUploadFormFields, enrichSkillUploadOptions };
