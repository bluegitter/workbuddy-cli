'use strict';
const path = require('node:path'); const os = require('node:os'); const fs = require('node:fs/promises');
const getDefaultBrandFolderName = () => process.env.WORKBUDDY_APP_NAME?.trim() || 'WorkBuddy';
function formatDefaultCwdTimestamp(now) { const pad = (value) => String(value).padStart(2, '0'); return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`; }
function generateDefaultCwd(root, now = new Date()) { return path.join(root, formatDefaultCwdTimestamp(now)); }
async function createDefaultCwd(root, now = new Date()) { await fs.mkdir(root, { recursive: true }); for (let attempt = 0; attempt < 100; attempt++) { const candidate = generateDefaultCwd(root, new Date(now.getTime() + attempt * 1000)); try { await fs.mkdir(candidate); return candidate; } catch (error) { if (error.code !== 'EEXIST') throw error; } } throw new Error(`Failed to create unique default cwd under ${root}`); }
async function resolveWorkspaceRoot(deps) { const fallback = path.join(os.homedir(), deps.getBrandFolderName?.() ?? getDefaultBrandFolderName()); try { const stored = await (await deps.services).config.get('workspace.defaultPath'); if (typeof stored === 'string' && path.isAbsolute(stored.trim())) { await fs.mkdir(stored.trim(), { recursive: true }); return stored.trim(); } } catch {} return fallback; }
function registerWorkspaceHandlers(registry, deps) {
  registry.handle('workspaceGetCurrent', async () => ({ cwd: '' }));
  registry.handle('workspaceGenerateDefaultCwd', async (params) => createDefaultCwd(typeof params?.root === 'string' && path.isAbsolute(params.root.trim()) ? params.root.trim() : await resolveWorkspaceRoot(deps)));
  registry.handle('workspaceGetClawCwd', async () => deps.clawCwd ?? '');
  registry.handle('workspaceInitialize', async (params) => {
    if (typeof params?.cwd !== 'string' || !params.cwd.trim()) return { success: true };
    const resolvedPath = params.cwd.trim().replace(/^~(?=\/|\\|$)/, os.homedir());
    try { await fs.mkdir(resolvedPath, { recursive: true }); return { success: true, resolvedPath }; }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  registry.handle('workspaceCheckPathExists', async (value) => { try { await fs.access(value); return true; } catch { return false; } });
  registry.handle('workspaceCheckPathsExist', async (values) => {
    const result = {};
    for (const value of Array.isArray(values) ? [...new Set(values.filter(Boolean))] : []) result[value] = await (async () => { try { await fs.access(value); return true; } catch { return false; } })();
    return result;
  });
  const list = async () => { try { return await deps.runtimeManager.listSessions(); } catch { return []; } };
  registry.handle('listSidecarSessions', list);
  registry.handle('resizeSidecar', async (id, cols, rows) => { if (id && cols > 0 && rows > 0) await deps.runtimeManager.resizeSession(id, cols, rows); });
}
module.exports = { getDefaultBrandFolderName, formatDefaultCwdTimestamp, generateDefaultCwd, createDefaultCwd, resolveWorkspaceRoot, registerWorkspaceHandlers };
