'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function legacyAppDataDir() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
}
function configDir() { return process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'); }
function getLegacyPlanDirectoryPath() { return path.join(legacyAppDataDir(), 'WorkBuddy', 'User', 'globalStorage', 'tencent-cloud.coding-copilot', 'plans'); }
function getLegacyBrainDirectoryPath() { return path.join(legacyAppDataDir(), 'WorkBuddy', 'User', 'globalStorage', 'tencent-cloud.coding-copilot', 'brain'); }
function getTargetPlanDirectoryPath() { return path.join(configDir(), 'plans'); }

class PlanMigrationService {
  migrateFromLegacyDirectory(sourcePath = getLegacyPlanDirectoryPath(), targetPath = getTargetPlanDirectoryPath()) {
    fs.mkdirSync(targetPath, { recursive: true });
    let plansMigrated = 0;
    if (fs.existsSync(sourcePath)) for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) if (entry.isDirectory()) {
      const content = this.readLegacyPlanContent(path.join(sourcePath, entry.name));
      if (content) { this.writePlan(targetPath, entry.name, content); plansMigrated++; }
    }
    const brainPath = getLegacyBrainDirectoryPath();
    if (fs.existsSync(brainPath)) for (const entry of fs.readdirSync(brainPath, { withFileTypes: true })) if (entry.isDirectory()) {
      const target = path.join(targetPath, entry.name, 'plan.md');
      const content = fs.existsSync(target) ? undefined : this.readLegacyPlanContent(path.join(brainPath, entry.name, 'plans'));
      if (content) { this.writePlan(targetPath, entry.name, content); plansMigrated++; }
    }
    return { sourcePath, targetPath, skipped: plansMigrated === 0 && !fs.existsSync(sourcePath) && !fs.existsSync(brainPath), plansMigrated };
  }

  writePlan(targetPath, conversationId, content) {
    const directory = path.join(targetPath, conversationId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'plan.md'), content, 'utf8');
  }

  readLegacyPlanContent(conversationPath) {
    const markdown = path.join(conversationPath, 'plan.md');
    if (fs.existsSync(markdown)) {
      const content = fs.readFileSync(markdown, 'utf8');
      return content.trim() ? content : undefined;
    }
    const jsonPath = path.join(conversationPath, 'plan.json');
    if (!fs.existsSync(jsonPath)) return undefined;
    try {
      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).content;
      return typeof content === 'string' && content.trim() ? content : undefined;
    } catch { return undefined; }
  }
}

module.exports = { PlanMigrationService, getLegacyPlanDirectoryPath, getLegacyBrainDirectoryPath, getTargetPlanDirectoryPath, legacyAppDataDir };
