'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STATUS_MAP = Object.freeze({ pending: 'pending', waiting: 'pending', 'in-progress': 'in_progress', completed: 'completed', error: 'pending' });
function legacyAppDataDir() { if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support'); if (process.platform === 'win32') return process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming'); return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config'); }
function configDir() { return process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'); }
function getLegacyTodosDirectoryPath() { return path.join(legacyAppDataDir(), 'WorkBuddy', 'User', 'globalStorage', 'tencent-cloud.coding-copilot', 'todos'); }
function getTargetTasksDirectoryPath() { return path.join(configDir(), 'tasks'); }

class LegacyTodosMigrationService {
  migrateFromLegacyDirectory(sourcePath = getLegacyTodosDirectoryPath(), targetPath = getTargetTasksDirectoryPath(), skipSessionIds = new Set()) {
    return { sourcePath, targetPath, skipped: true, totalFilesRead: 0, totalTodosFound: 0, sessionsMigrated: 0, sessionsSkipped: 0, tasksMigrated: 0 };
  }

  readLegacyTodoFiles(dirPath) {
    const results = [];
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const conversationId = entry.name.replace('.json', '');
        if (!conversationId) continue;
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(dirPath, entry.name), 'utf8'));
          const todos = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.todos) ? parsed.todos : [];
          const updatedAt = Array.isArray(parsed) ? undefined : parsed?.updatedAt;
          if (todos.length) results.push({ conversationId, todos, updatedAt });
        } catch {}
      }
    } catch {}
    return results;
  }

  convertToNewTasks(legacyTodos, updatedAt) {
    const timestamp = updatedAt ?? Date.now();
    const tasks = [];
    let id = 1;
    for (const todo of legacyTodos || []) if (todo?.content) {
      tasks.push({ id: String(id++), subject: todo.content, description: todo.content, activeForm: todo.content, status: STATUS_MAP[todo.status] || 'pending', createdAt: timestamp, updatedAt: timestamp });
    }
    return tasks;
  }
}

module.exports = { STATUS_MAP, LegacyTodosMigrationService, getLegacyTodosDirectoryPath, getTargetTasksDirectoryPath, legacyAppDataDir };
