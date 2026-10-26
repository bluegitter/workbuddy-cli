'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
function getAdmZip() { return require('adm-zip'); }

const PLUGIN_METADATA_DIRS = ['.codebuddy-plugin', '.workbuddy-plugin'];
const PLUGIN_MANIFEST_FILE = 'plugin.json';
const GENERATED_ZIP_ENTRY_TIME = new Date('2000-01-01T00:00:00.000Z');
const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;
const DEFAULT_MARKETPLACE_NAME = 'my-experts';

function removeUndefinedFields(value) { return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)); }
function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function normalizeLocalizedManifestItems(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  const zh = Array.isArray(value.zh) ? value.zh : [];
  const en = Array.isArray(value.en) ? value.en : [];
  return Array.from({ length: Math.max(zh.length, en.length) }, (_, index) => removeUndefinedFields({ zh: zh[index], en: en[index] }));
}
function normalizeManifestItems(value) { return value === undefined ? undefined : Array.isArray(value) ? value : []; }
function getZipEntryText(zip, entryName) { const entry = zip.getEntry(entryName); return !entry || entry.isDirectory ? undefined : entry.getData().toString('utf8'); }
function getMimeType(filePath) { const ext = path.extname(filePath).toLowerCase(); return ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/png'; }
function cloneZipEntryTime(time) { return time ? new Date(time.getTime()) : new Date(GENERATED_ZIP_ENTRY_TIME.getTime()); }
function resolveAvatarFromExpertZip(zip, rootDir, avatar) {
  if (typeof avatar !== 'string' || !avatar) return undefined;
  if (/^(https?|data):/i.test(avatar)) return avatar;
  const relative = avatar.replace(/^\.\//, '').replace(/^\//, '');
  for (const candidate of (rootDir ? [`${rootDir}/${relative}`, relative] : [relative])) { const entry = zip.getEntry(candidate); if (entry && !entry.isDirectory) return `data:${getMimeType(candidate)};base64,${entry.getData().toString('base64')}`; }
  return avatar;
}
function findPluginManifestEntry(zip) {
  for (const metadataDir of PLUGIN_METADATA_DIRS) { const suffix = `${metadataDir}/${PLUGIN_MANIFEST_FILE}`; const entry = zip.getEntries().find((item) => !item.isDirectory && item.entryName.endsWith(suffix)); if (entry) return { entryName: entry.entryName, metadataDir, time: entry.header?.time }; }
  return undefined;
}
async function fileExists(filePath) { try { await fs.promises.access(filePath); return true; } catch { return false; } }
async function findPluginManifestPath(expertDir) { for (const metadataDir of PLUGIN_METADATA_DIRS) { const manifestPath = path.join(expertDir, metadataDir, PLUGIN_MANIFEST_FILE); if (await fileExists(manifestPath)) return { manifestPath, metadataDir }; } return undefined; }
function shouldSkipExpertPackageFile(fileName) { return fileName === '.DS_Store' || fileName === '.created-by-session'; }
async function addExpertDirectoryToZip(zip, sourceDir, zipRoot, currentDir = sourceDir, result = { skippedFiles: [] }) {
  for (const entry of await fs.promises.readdir(currentDir, { withFileTypes: true })) {
    if (shouldSkipExpertPackageFile(entry.name)) continue;
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(sourceDir, absolutePath);
    if (entry.isDirectory()) { await addExpertDirectoryToZip(zip, sourceDir, zipRoot, absolutePath, result); continue; }
    if (!entry.isFile()) continue;
    const stat = await fs.promises.stat(absolutePath);
    if (stat.size > MAX_ZIP_ENTRY_BYTES) { result.skippedFiles.push({ relativePath, size: stat.size }); continue; }
    zip.addLocalFile(absolutePath, path.join(zipRoot, path.dirname(relativePath)));
  }
  return result;
}
function writeShareAuthorToZipManifest(zip, shareAuthorName) {
  const authorName = shareAuthorName?.trim(); if (!authorName) return;
  const info = findPluginManifestEntry(zip); if (!info) return;
  try { const manifest = JSON.parse(getZipEntryText(zip, info.entryName) || '{}'); manifest.sharedBy = authorName; zip.deleteFile(info.entryName); const entry = zip.addFile(info.entryName, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')); entry.header.time = cloneZipEntryTime(info.time); } catch (error) { console.warn('[ExpertShare][exportZip] failed to write sharedBy metadata:', error); }
}
async function exportExpertZip({ expertRootDir, expertId, shareAuthorName }) {
  if (!expertRootDir || !expertId || !/^[a-zA-Z0-9._-]+$/.test(expertId) || expertId === '.' || expertId === '..') return { success: false, error: 'Invalid expert export params' };
  try { await fs.promises.access(expertRootDir); const zip = new (getAdmZip())(); const { skippedFiles } = await addExpertDirectoryToZip(zip, expertRootDir, expertId); writeShareAuthorToZipManifest(zip, shareAuthorName); const zipPath = path.join(os.tmpdir(), `expert-share-${expertId}-${Date.now()}.zip`); zip.writeZip(zipPath); return { success: true, zipPath, ...(skippedFiles.length ? { skippedFiles } : {}) }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
}
function getTriggerPrompts(manifest) { const explicit = normalizeLocalizedManifestItems(manifest.triggerPrompts); if (explicit !== undefined) return explicit; const onboarding = manifest.onboarding; if (!isRecord(onboarding)) return undefined; const prompts = normalizeLocalizedManifestItems(onboarding.triggerPrompts); if (prompts !== undefined) return prompts; if (Array.isArray(onboarding.triggerPrompt)) return onboarding.triggerPrompt; return typeof onboarding.triggerPrompt === 'string' ? [onboarding.triggerPrompt] : undefined; }
function readExpertPreviewMetadataFromZip(zipBuffer, fallbackExpertName) {
  const zip = new (getAdmZip())(zipBuffer); const info = findPluginManifestEntry(zip); if (!info) throw new Error(`Missing ${PLUGIN_METADATA_DIRS.join(' or ')}/${PLUGIN_MANIFEST_FILE}`); const manifest = JSON.parse(getZipEntryText(zip, info.entryName) || '{}'); const rootDir = info.entryName.slice(0, -`${info.metadataDir}/${PLUGIN_MANIFEST_FILE}`.length).replace(/\/$/, ''); const expertId = manifest.name || manifest.id || rootDir || fallbackExpertName || 'custom-expert'; const members = Array.isArray(manifest.members) ? manifest.members.map((member) => member && typeof member === 'object' ? { ...member, avatar: resolveAvatarFromExpertZip(zip, rootDir, member.avatar) } : member) : manifest.members;
  return removeUndefinedFields({ type: 'expert', expertId, expertName: fallbackExpertName || manifest.profession || manifest.displayName || manifest.name || expertId, displayName: manifest.displayName, profession: manifest.profession, description: manifest.description, displayDescription: manifest.displayDescription, avatar: resolveAvatarFromExpertZip(zip, rootDir, manifest.avatar), author: manifest.author, sharedBy: manifest.sharedBy, categoryId: manifest.categoryId, categoryName: manifest.categoryName, expertType: manifest.expertType, version: manifest.version, tags: normalizeLocalizedManifestItems(manifest.tags), skills: manifest.skills, quickPrompts: normalizeLocalizedManifestItems(manifest.quickPrompts), triggerPrompts: getTriggerPrompts(manifest), members: normalizeManifestItems(members), teamInfo: manifest.teamInfo, leader: manifest.leader });
}
async function fetchExpertZipBuffer(fetchImpl, downloadUrl) { if (!downloadUrl?.trim()) return { errorKey: 'invalid_download_url', errorMessage: 'Missing expert package download URL' }; try { const response = await fetchImpl(downloadUrl); if (!response.ok) return { errorKey: 'download_failed', errorMessage: `Download expert package failed: HTTP ${response.status}` }; const buffer = Buffer.from(await response.arrayBuffer()); return buffer.length ? { buffer } : { errorKey: 'invalid_package', errorMessage: 'Downloaded expert package is empty' }; } catch (error) { return { errorKey: 'download_failed', errorMessage: error instanceof Error ? error.message : String(error) }; } }
async function writeExpertZipToTemp(buffer) { const zipPath = path.join(os.tmpdir(), `expert-import-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`); await fs.promises.writeFile(zipPath, buffer); return zipPath; }
async function installExpertZipFromPath({ configDir, zipPath, expertName, overwrite = false, cleanupZip = false, marketplaceName = DEFAULT_MARKETPLACE_NAME }) {
  let extractDir;
  try {
    if (!zipPath || !await fileExists(zipPath)) return { success: false, errorKey: 'invalid_package', errorMessage: 'Expert zip not found' };
    extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'expert-import-')); new (getAdmZip())(zipPath).extractAllTo(extractDir, true);
    const dirs = (await fs.promises.readdir(extractDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()); if (dirs.length !== 1) return { success: false, errorKey: 'invalid_package', errorMessage: `Expected single top-level directory, found ${dirs.length}` };
    const sourceDir = path.join(extractDir, dirs[0].name); const manifestInfo = await findPluginManifestPath(sourceDir); if (!manifestInfo) return { success: false, errorKey: 'invalid_package', errorMessage: `Missing ${PLUGIN_METADATA_DIRS.join(' or ')}/${PLUGIN_MANIFEST_FILE}` };
    let expertId = dirs[0].name;
    try { const manifest = JSON.parse(await fs.promises.readFile(manifestInfo.manifestPath, 'utf8')); if (manifest.name) expertId = manifest.name; for (const field of ['tags', 'quickPrompts', 'triggerPrompts']) { const normalized = normalizeLocalizedManifestItems(manifest[field]); if (normalized !== undefined) manifest[field] = normalized; } for (const field of ['members', 'connectorIds', 'bin', 'references']) { const normalized = normalizeManifestItems(manifest[field]); if (normalized !== undefined) manifest[field] = normalized; } await fs.promises.writeFile(manifestInfo.manifestPath, JSON.stringify(manifest, null, 2)); } catch {}
    if (!/^[a-zA-Z0-9._-]+$/.test(expertId) || expertId === '.' || expertId === '..') return { success: false, errorKey: 'invalid_package', errorMessage: `Invalid expert id "${expertId}"` };
    const pluginsRoot = path.resolve(configDir, 'plugins', 'marketplaces', marketplaceName, 'plugins'); const targetDir = path.resolve(pluginsRoot, expertId); if (!targetDir.startsWith(`${pluginsRoot}${path.sep}`)) return { success: false, errorKey: 'invalid_package', errorMessage: `Invalid expert install path for "${expertId}"` };
    await fs.promises.mkdir(pluginsRoot, { recursive: true });
    if (await fileExists(targetDir)) { if (!overwrite) return { success: false, errorKey: 'duplicate_expert', errorMessage: `Expert "${expertName || expertId}" already exists`, expertId, localPath: targetDir }; await fs.promises.rm(targetDir, { recursive: true, force: true }); }
    await fs.promises.rename(sourceDir, targetDir); return { success: true, expertId, localPath: targetDir };
  } catch (error) { return { success: false, errorKey: 'unknown', errorMessage: error instanceof Error ? error.message : String(error) }; } finally { if (extractDir) await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {}); if (cleanupZip) await fs.promises.unlink(zipPath).catch(() => {}); }
}

module.exports = Object.freeze({ PLUGIN_METADATA_DIRS, PLUGIN_MANIFEST_FILE, MAX_ZIP_ENTRY_BYTES, removeUndefinedFields, normalizeLocalizedManifestItems, normalizeManifestItems, findPluginManifestEntry, findPluginManifestPath, resolveAvatarFromExpertZip, exportExpertZip, readExpertPreviewMetadataFromZip, getTriggerPrompts, fetchExpertZipBuffer, writeExpertZipToTemp, installExpertZipFromPath });
