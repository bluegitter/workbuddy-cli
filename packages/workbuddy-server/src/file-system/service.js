'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

const DEV_DATA_PATH_FRAGMENT = 'refactor/agent/new-acp-client-io-data';
const MAX_BASE64_READ_SIZE = 50 * 1024 * 1024;
function createFileService({ configDir }) {
  const normalizedConfig = path.normalize(configDir); const homeDir = os.homedir(); const isWindows = process.platform === 'win32';
  const compare = (value) => { const normalized = value.normalize('NFC'); return isWindows ? normalized.toLowerCase() : normalized; };
  const within = (candidate, root) => candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
  const resolveUri = (value) => { if (!value.startsWith('file://')) return value; try { return fileURLToPath(value); } catch { return value.slice(7); } };
  const normalizeLocalPath = (value) => { const resolved = resolveUri(value); const match = isWindows && resolved.match(/^[/\\]([a-zA-Z]:[/\\].*)$/); return match ? match[1] : resolved; };
  async function validatePath(value, options = {}) { const normalized = path.normalize(normalizeLocalPath(value)); const candidate = compare(normalized); const roots = [normalizedConfig, homeDir, ...(options.allowedDirs || []).filter((dir) => typeof dir === 'string' && dir.trim()).map(normalizeLocalPath)].map(path.normalize).map(compare); if (!roots.some((root) => within(candidate, root)) && !normalized.includes(DEV_DATA_PATH_FRAGMENT)) throw new Error(`Access denied: path not in allowed directories. Path: ${value}`); if (normalized.split(path.sep).includes('..')) throw new Error(`Access denied: relative path escape detected. Path: ${value}`); return normalized; }
  async function atomicWrite(filePath, content, encoding, options) { const resolved = await validatePath(filePath, options); await fsp.mkdir(path.dirname(resolved), { recursive: true }); const temporary = `${resolved}.tmp`; await fsp.writeFile(temporary, content, { encoding }); await fsp.rename(temporary, resolved); }
  async function walk(root, current, search, limit, results) { if (results.length >= limit) return; let entries; try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { return; } for (const entry of entries) { if (results.length >= limit) break; if (entry.name.startsWith('.') || ['node_modules', '__pycache__'].includes(entry.name)) continue; const fullPath = path.join(current, entry.name); if (!search || entry.name.toLowerCase().includes(search)) results.push({ path: fullPath, relativePath: path.relative(root, fullPath), fileName: entry.isFile() ? entry.name : undefined, folderName: entry.isDirectory() ? entry.name : undefined, type: entry.isDirectory() ? 'folder' : 'file' }); if (entry.isDirectory()) await walk(root, fullPath, search, limit, results); } }
  return {
    async appendRecord(params) { const target = await validatePath(params.filePath); await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.appendFile(target, params.jsonLine, 'utf8'); },
    async exists(filePath) { try { await fsp.access(filePath); return true; } catch { return false; } },
    async getInfo(filePath) { const stat = await fsp.stat(await validatePath(filePath)); return { size: stat.size, isDirectory: stat.isDirectory(), isFile: stat.isFile(), mtime: stat.mtimeMs, ctime: stat.ctimeMs }; },
    async listDirectory(dirPath) { const target = path.normalize(resolveUri(dirPath)); if (target.split(path.sep).includes('..')) return []; try { const entries = await fsp.readdir(target, { withFileTypes: true }); return Promise.all(entries.map(async (entry) => { const stat = await fsp.stat(path.join(target, entry.name)); return { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file', size: stat.size }; })); } catch { return []; } },
    async makeDirectory(dirPath, recursive = true) { await fsp.mkdir(await validatePath(dirPath), { recursive }); },
    async read(filePath, encoding = 'utf-8', options) { const target = await validatePath(filePath, options); if (encoding !== 'base64') return fsp.readFile(target, { encoding }); const stat = await fsp.stat(target); if (stat.size > MAX_BASE64_READ_SIZE) { if (isImage(target)) { const compressed = await compressImageExternally(target); if (compressed) return compressed; } const error = new Error(`File is too large to read as base64 (${(stat.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is 50 MB.`); error.code = 'FILE_TOO_LARGE'; error.fileSize = stat.size; throw error; } return (await fsp.readFile(target)).toString('base64'); },
    async remove(filePath, recursive = true) { await fsp.rm(await validatePath(filePath), { recursive, force: true }); },
    async rename(oldPath, newPath) { await fsp.rename(await validatePath(oldPath), await validatePath(newPath)); },
    async search({ cwd, search = '', resultNum = 100 }) { const results = []; await validatePath(cwd); await walk(cwd, cwd, search.toLowerCase(), resultNum, results); return results; },
    write: (filePath, content, encoding = 'utf-8', options) => atomicWrite(filePath, content, encoding, options),
    writeBatch: (files, options) => Promise.all(files.map((file) => atomicWrite(file.path, file.data, file.encoding || 'utf-8', options))),
    async readChunked(params, options) { const target = await validatePath(params.filePath, options); const stat = await fsp.stat(target); if (!stat.isFile()) throw new Error('path is not a file'); const totalSize = stat.size; const offset = params.offset || 0; const bytesToRead = Math.min(params.chunkSize || 10 * 1024 * 1024, totalSize - offset); if (bytesToRead <= 0) return { data: '', bytesRead: 0, totalSize, done: true }; const handle = await fsp.open(target, 'r'); try { const buffer = Buffer.alloc(bytesToRead); const { bytesRead } = await handle.read(buffer, 0, bytesToRead, offset); return { data: buffer.subarray(0, bytesRead).toString('base64'), bytesRead, totalSize, done: offset + bytesRead >= totalSize }; } finally { await handle.close(); } },
  };
}
function isImage(filePath) { return new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif']).has(path.extname(filePath).toLowerCase()); }
async function compressImageExternally(filePath) { const output = path.join(os.tmpdir(), `wb-img-compress-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpeg`); const run = promisify(execFile); try { if (process.platform === 'darwin') await run('sips', ['--resampleHeightWidthMax', '2000', '--setProperty', 'format', 'jpeg', '--setProperty', 'formatOptions', '80', filePath, '--out', output], { timeout: 120_000 }); else if (process.platform === 'linux') await run('convert', [filePath, '-resize', '2000x2000>', '-quality', '80', output], { timeout: 120_000 }); else return undefined; return (await fsp.readFile(output)).toString('base64'); } catch { return undefined; } finally { await fsp.unlink(output).catch(() => {}); } }

module.exports = { createFileService, compressImageExternally, MAX_BASE64_READ_SIZE, DEV_DATA_PATH_FRAGMENT };
