'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

class MediaIndexMigrationService {
  migrate(sourceDir = getLegacyMediaIndexDir(), outputDir = getMediaIndexOutputDir(), projectsDir = getProjectsDir()) {
    const result = { sourceDir, indexFilesScanned: 0, totalRecords: 0, recordsWritten: 0, recordsSkippedExisting: 0, recordsSkippedNoFile: 0, syntheticEntriesCleaned: 0, skipped: false };
    if (!fs.existsSync(sourceDir)) { result.skipped = true; return result; }
    const grouped = this.loadAndGroupRecords(sourceDir, result);
    if (!grouped.size) { result.skipped = result.totalRecords === 0; return result; }
    fs.mkdirSync(outputDir, { recursive: true });
    for (const [sessionId, entries] of grouped) this.writeSessionIndex(outputDir, sessionId, entries, result);
    result.syntheticEntriesCleaned = this.cleanSyntheticEntries(projectsDir);
    return result;
  }
  loadAndGroupRecords(sourceDir, result) { const grouped = new Map(); let files = []; try { files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.json')); } catch { return grouped; } for (const file of files) { result.indexFilesScanned++; const sourceHash = file.slice(0, -5); try { const parsed = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8')); for (const record of Object.values(parsed.records || {})) { result.totalRecords++; if (!record.sessionId || !record.filePath) continue; if (!grouped.has(record.sessionId)) grouped.set(record.sessionId, []); grouped.get(record.sessionId).push({ sourceHash, record }); } } catch {} } return grouped; }
  writeSessionIndex(outputDir, sessionId, entries, result) { const indexPath = path.join(outputDir, `${sessionId}.json`); if (fs.existsSync(indexPath)) { result.recordsSkippedExisting += entries.length; return; } const records = entries.filter(({ record }) => { if (!fs.existsSync(record.filePath)) { result.recordsSkippedNoFile++; return false; } return true; }).map(({ record }) => ({ filePath: record.filePath, fileName: record.fileName, mimeType: record.mimeType, contentType: record.contentType, size: record.size, timestamp: record.timestamp })); if (!records.length) return; fs.writeFileSync(indexPath, JSON.stringify({ version: 1, migratedAt: Date.now(), sourceHash: entries[0].sourceHash, records }, null, 2)); result.recordsWritten += records.length; }
  cleanSyntheticEntries(projectsDir) { if (!fs.existsSync(projectsDir)) return 0; let total = 0; let dirs; try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { return 0; } for (const dir of dirs) if (dir.isDirectory()) { let files; try { files = fs.readdirSync(path.join(projectsDir, dir.name)).filter((file) => file.endsWith('.jsonl')); } catch { continue; } for (const file of files) total += this.cleanSyntheticEntriesFromFile(path.join(projectsDir, dir.name, file)); } return total; }
  cleanSyntheticEntriesFromFile(jsonlPath) { let content; try { content = fs.readFileSync(jsonlPath, 'utf8'); } catch { return 0; } if (!content.includes('migrated-media-')) return 0; let cleaned = 0; const lines = content.split('\n').filter((line) => { if (!line.trim()) return true; try { const item = JSON.parse(line); if (typeof item.id === 'string' && item.id.startsWith('migrated-media-')) { cleaned++; return false; } } catch {} return true; }); if (cleaned) fs.writeFileSync(jsonlPath, lines.join('\n')); return cleaned; }
}
function getLegacyAppDataDir() { if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support'); if (process.platform === 'win32') return process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming'); return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config'); }
function getLegacyMediaIndexDir() { return path.join(getLegacyAppDataDir(), 'WorkBuddy', 'User', 'globalStorage', 'tencent-cloud.coding-copilot', 'media-index'); }
function getMediaIndexOutputDir() { return path.join(process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'), 'media-index'); }
function getProjectsDir() { return path.join(process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'), 'projects'); }

module.exports = { MediaIndexMigrationService, getLegacyAppDataDir, getLegacyMediaIndexDir, getMediaIndexOutputDir, getProjectsDir };
