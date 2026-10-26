'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_REPAIR_ATTEMPTS = 3;
const FRAGMENT_DIR_RE = /^.+-workspace-files-\d+-(.+)$/;

function compressPath(value) { return value.replace(/[\/\\:]/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-'); }
function getWorkbuddyHomeDir() { return process.env.CODEBUDDY_CONFIG_DIR?.trim() || process.env.WORKBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'); }
async function pathExists(value) { try { await fs.promises.access(value); return true; } catch { return false; } }

class SessionFragmentRepairService {
  async repair(database, fileLogger, force = false) {
    const startedAt = Date.now();
    if (process.platform !== 'win32') return { repaired: 0, skipped: 0, elapsedMs: Date.now() - startedAt };
    const home = getWorkbuddyHomeDir();
    const projects = path.join(home, 'projects');
    const done = path.join(home, 'session_fragment_repair_done520');
    if (!force && await pathExists(done)) return { repaired: 0, skipped: 0, elapsedMs: Date.now() - startedAt };
    const attemptsPath = path.join(home, 'session_fragment_repair_attempts');
    const attempts = force ? 0 : await this.readAttempts(attemptsPath);
    if (!force && attempts >= MAX_REPAIR_ATTEMPTS) { await this.writeDoneMarker(done, fileLogger); await this.unlinkAttempts(attemptsPath, fileLogger); return { repaired: 0, skipped: 0, elapsedMs: Date.now() - startedAt }; }
    if (!await pathExists(projects)) { await this.writeDoneMarker(done, fileLogger); return { repaired: 0, skipped: 0, elapsedMs: Date.now() - startedAt }; }
    const fragments = (await fs.promises.readdir(projects, { withFileTypes: true })).map((entry) => { const match = entry.isDirectory() && FRAGMENT_DIR_RE.exec(entry.name); return match ? { dir: path.join(projects, entry.name), sessionId: match[1] } : undefined; }).filter(Boolean);
    if (!fragments.length) { await this.writeDoneMarker(done, fileLogger); return { repaired: 0, skipped: 0, elapsedMs: Date.now() - startedAt }; }
    try { await this.copyDirSafe(projects, path.join(home, `projects_repair_backup_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}`), fileLogger); } catch {}
    const grouped = new Map();
    for (const fragment of fragments) grouped.set(fragment.sessionId, [...(grouped.get(fragment.sessionId) || []), fragment.dir]);
    let repaired = 0; let skipped = 0; let failed = false;
    for (const [sessionId, dirs] of grouped) {
      try { const result = await this.repairSession(sessionId, dirs, projects, database, fileLogger); if (result === 'repaired') repaired++; else { skipped++; failed ||= result === 'failed'; } } catch (error) { failed = true; skipped++; fileLogger.warn?.(`[SessionFragmentRepair] ${sessionId}: ${error?.message || error}`); }
    }
    if (failed && !force) await this.writeAttempts(attemptsPath, attempts + 1, fileLogger);
    else if (!failed) { await this.writeDoneMarker(done, fileLogger); if (!force) await this.unlinkAttempts(attemptsPath, fileLogger); }
    return { repaired, skipped, elapsedMs: Date.now() - startedAt };
  }

  async repairSession(sessionId, fragmentDirs, projectsDir, database, logger) {
    const session = database.getSession(sessionId);
    if (!session?.cwd) return 'skipped_no_db';
    const expectedName = compressPath(session.cwd);
    const match = (await fs.promises.readdir(projectsDir, { withFileTypes: true })).find((entry) => entry.isDirectory() && entry.name.toLowerCase() === expectedName.toLowerCase());
    const target = path.join(projectsDir, match?.name || expectedName);
    await fs.promises.mkdir(target, { recursive: true });
    const jsonlName = `${sessionId}.jsonl`; const metaName = `${sessionId}.meta.json`;
    const lines = [];
    const extraFiles = [];
    for (const fragment of fragmentDirs) {
      const scan = async (dir, relative = '') => {
        for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
          const rel = relative ? `${relative}/${entry.name}` : entry.name; const absolute = path.join(dir, entry.name);
          if (entry.isDirectory()) await scan(absolute, rel);
          else if (!(relative === '' && (entry.name === jsonlName || entry.name === metaName))) extraFiles.push({ src: absolute, rel, subdir: relative !== '' });
        }
      };
      await scan(fragment);
      const source = path.join(fragment, jsonlName);
      if (await pathExists(source)) for (const line of (await fs.promises.readFile(source, 'utf8')).split('\n').filter((value) => value.trim())) lines.push(line);
    }
    const original = path.join(target, jsonlName);
    if (await pathExists(original)) lines.unshift(...(await fs.promises.readFile(original, 'utf8')).split('\n').filter((value) => value.trim()));
    if (!lines.length) return 'failed';
    const unique = [...new Set(lines)].map((line) => { try { return { line, ts: Number(JSON.parse(line).timestamp) || 0 }; } catch { return { line, ts: 0 }; } }).sort((a, b) => a.ts - b.ts);
    const temp = `${original}.tmp`; await fs.promises.writeFile(temp, `${unique.map(({ line }) => line).join('\n')}\n`, 'utf8'); await fs.promises.rename(temp, original);
    for (const fragment of fragmentDirs) {
      const meta = path.join(fragment, metaName); const targetMeta = path.join(target, metaName);
      if (await pathExists(meta) && !await pathExists(targetMeta)) await fs.promises.rename(meta, targetMeta);
    }
    for (const file of extraFiles) {
      const destination = path.join(target, file.rel); await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      if (await pathExists(destination)) { if (!file.subdir) await fs.promises.copyFile(file.src, `${destination}.bak`); }
      else await fs.promises.copyFile(file.src, destination);
    }
    for (const fragment of fragmentDirs) await fs.promises.rm(fragment, { recursive: true, force: true });
    logger.info?.(`[SessionFragmentRepair] repaired ${sessionId}`);
    return 'repaired';
  }

  async copyDirSafe(source, destination, logger) {
    await fs.promises.mkdir(destination, { recursive: true });
    for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const from = path.join(source, entry.name); const to = path.join(destination, entry.name);
      if (entry.isDirectory()) await this.copyDirSafe(from, to, logger); else if (entry.isFile()) await fs.promises.copyFile(from, to);
    }
  }
  async writeDoneMarker(file, logger) { try { await fs.promises.writeFile(file, new Date().toISOString(), 'utf8'); } catch (error) { logger.warn?.(`[SessionFragmentRepair] marker failed: ${error?.message || error}`); } }
  async readAttempts(file) { try { const value = (await fs.promises.readFile(file, 'utf8')).trim(); return /^\+?\d+$/.test(value) ? Number(value) : 0; } catch { return 0; } }
  async writeAttempts(file, count, logger) { try { await fs.promises.writeFile(file, String(count), 'utf8'); } catch (error) { logger.warn?.(`[SessionFragmentRepair] attempts failed: ${error?.message || error}`); } }
  async unlinkAttempts(file, logger) { try { await fs.promises.unlink(file); } catch (error) { if (error.code !== 'ENOENT') logger.warn?.(`[SessionFragmentRepair] unlink attempts failed: ${error?.message || error}`); } }
}

module.exports = { MAX_REPAIR_ATTEMPTS, compressPath, getWorkbuddyHomeDir, SessionFragmentRepairService };
