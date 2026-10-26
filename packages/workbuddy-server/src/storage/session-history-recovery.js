'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SYSTEM_CONTEXT_PATTERNS = Object.freeze([
  /<additional_data>[\s\S]*?<\/additional_data>\s*/g,
  /<user_info>[\s\S]*?<\/user_info>\s*/g,
  /<cb_summary>[\s\S]*?<\/cb_summary>\s*/g,
  /<rules>[\s\S]*?<\/rules>\s*/g,
  /<content_policy>[\s\S]*?<\/content_policy>\s*/g,
  /<agent_skills>[\s\S]*?<\/agent_skills>\s*/g,
  /<always_applied_workspace_rules\b[^>]*>[\s\S]*?<\/always_applied_workspace_rules>\s*/g,
  /<agent_requestable_workspace_rules\b[^>]*>[\s\S]*?<\/agent_requestable_workspace_rules>\s*/g,
  /<project_context>[\s\S]*?<\/project_context>\s*/g,
  /<communication>[\s\S]*?<\/communication>\s*/g,
  /<tool_calling>[\s\S]*?<\/tool_calling>\s*/g,
  /<making_code_changes>[\s\S]*?<\/making_code_changes>\s*/g,
  /<response_language>[\s\S]*?<\/response_language>\s*/g,
  /<git_status>[\s\S]*?<\/git_status>\s*/g,
]);

class SessionHistoryRecovery {
  constructor(options) {
    this.options = options;
    this.logger = options.logger ?? console;
  }

  rebuildSessionIndexFromHistory(projectsDir) {
    if (!this.options.isInitialized() || !fs.existsSync(projectsDir)) return 0;
    let rebuilt = 0;
    try {
      const cwdDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());
      for (const cwdDir of cwdDirs) {
        try {
          rebuilt += this.rebuildProjectDirectory(projectsDir, cwdDir.name);
        } catch (error) {
          this.logger.warn(`Failed to scan project dir ${cwdDir.name}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan projects directory: ${errorMessage(error)}`);
    }
    if (rebuilt > 0) this.logger.info(`Rebuilt ${rebuilt} session records from history files`);
    return rebuilt;
  }

  rebuildProjectDirectory(projectsDir, directoryName) {
    const directoryPath = path.join(projectsDir, directoryName);
    const jsonlFiles = fs.readdirSync(directoryPath).filter((file) => file.endsWith('.jsonl'));
    let rebuilt = 0;
    for (const jsonlFile of jsonlFiles) {
      try {
        if (this.rebuildSessionFile(directoryPath, directoryName, jsonlFiles.length, jsonlFile)) {
          rebuilt += 1;
        }
      } catch (error) {
        this.logger.warn(`Failed to rebuild session from ${jsonlFile}: ${errorMessage(error)}`);
      }
    }
    return rebuilt;
  }

  rebuildSessionFile(directoryPath, directoryName, jsonlFileCount, jsonlFile) {
    const jsonlPath = path.join(directoryPath, jsonlFile);
    const sessionId = jsonlFile.replace(/\.jsonl$/, '');
    if (!sessionId) return false;
    const stat = fs.statSync(jsonlPath);
    if (stat.size === 0) return false;

    const meta = readJsonFile(path.join(directoryPath, `${sessionId}.meta.json`)) ?? {};
    const extracted = this.extractSessionInfoFromJsonl(jsonlPath);
    const cwd = extracted.cwd || (typeof meta.cwd === 'string' ? meta.cwd : '') || '';
    const createdAt = parseTimestamp(meta.createdAt)
      || extracted.firstTimestamp
      || stat.birthtimeMs;
    const updatedAt = parseTimestamp(meta.updatedAt)
      || extracted.lastTimestamp
      || stat.mtimeMs;
    const isPlayground = 'isPlayground' in meta
      ? Boolean(meta.isPlayground)
      : this.inferIsPlaygroundFromDir(directoryName, jsonlFileCount);

    this.options.upsertSession({
      id: sessionId,
      cwd,
      userId: '',
      title: extracted.aiTitle || undefined,
      status: 'Completed',
      createdAt,
      updatedAt,
      lastActivityAt: stat.mtimeMs,
      isPlayground,
      model: extracted.model || (typeof meta.model === 'string' ? meta.model : undefined),
      projectId: typeof meta.projectId === 'string' && meta.projectId.trim()
        ? meta.projectId.trim()
        : undefined,
    });
    return true;
  }

  inferIsPlaygroundFromDir(directoryName, jsonlFileCount) {
    if (jsonlFileCount > 1) return false;
    return /WorkBuddy-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/i.test(directoryName);
  }

  extractSessionInfoFromJsonl(jsonlPath) {
    const result = {};
    let customTitle;
    let aiTitle;
    let topicTitle;
    let firstUserMessage;
    try {
      const fd = fs.openSync(jsonlPath, 'r');
      try {
        const fileSize = fs.fstatSync(fd).size;
        const headBufferSize = 64 * 1024;
        const head = readFileSection(fd, 0, Math.min(headBufferSize, fileSize));
        const headLines = head.split('\n').slice(0, 30);
        for (const line of headLines) {
          const item = parseJsonLine(line);
          if (!item) continue;
          const timestamp = typeof item.timestamp === 'number' ? item.timestamp : undefined;
          if (timestamp) {
            if (!result.firstTimestamp) result.firstTimestamp = timestamp;
            result.lastTimestamp = timestamp;
          }
          if (!result.cwd && typeof item.cwd === 'string' && item.cwd) result.cwd = item.cwd;
          if (!aiTitle && item.type === 'ai-title' && nonEmptyString(item.aiTitle)) aiTitle = item.aiTitle.trim();
          if (item.type === 'custom-title' && nonEmptyString(item.customTitle)) customTitle = item.customTitle.trim();
          if (!topicTitle && item.type === 'topic' && nonEmptyString(item.topic)) topicTitle = item.topic.trim();
          if (!result.model && typeof item.model === 'string') result.model = item.model;
          if (!firstUserMessage && isUserTitleCandidate(item)) {
            firstUserMessage = this.extractUserMessageText(item.content);
          }
        }

        if (!customTitle && fileSize > headBufferSize) {
          const tailBufferSize = 32 * 1024;
          const tailOffset = Math.max(0, fileSize - tailBufferSize);
          const tailLines = readFileSection(fd, tailOffset, fileSize - tailOffset).split('\n');
          for (let index = tailLines.length - 1; index >= 0; index -= 1) {
            const item = parseJsonLine(tailLines[index]);
            if (!item) continue;
            if (item.type === 'custom-title' && nonEmptyString(item.customTitle)) {
              customTitle = item.customTitle.trim();
              break;
            }
            if (!aiTitle && item.type === 'ai-title' && nonEmptyString(item.aiTitle)) {
              aiTitle = item.aiTitle.trim();
            }
          }
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return result;
    }

    const resolvedTitle = customTitle ?? aiTitle ?? topicTitle;
    if (resolvedTitle) result.aiTitle = resolvedTitle;
    else if (firstUserMessage) {
      result.aiTitle = firstUserMessage.length > 50
        ? `${firstUserMessage.slice(0, 50)}...`
        : firstUserMessage;
    }
    return result;
  }

  extractUserMessageText(content) {
    if (typeof content === 'string') return this.stripContextAndExtractQuery(content);
    if (!Array.isArray(content)) return undefined;
    for (const block of content) {
      if (typeof block === 'string') {
        const extracted = this.stripContextAndExtractQuery(block);
        if (extracted) return extracted;
        continue;
      }
      if (!block || typeof block !== 'object') continue;
      if (block.type && block.type !== 'input_text') continue;
      const text = block.text ?? block.input_text;
      if (typeof text !== 'string' || !text.trim()) continue;
      if (text.includes('<image_local_path>')) continue;
      if (text.trimStart().startsWith('<system-reminder') && !text.includes('<user_query>')) continue;
      if (nonEmptyString(block.providerData?.content)) return block.providerData.content.trim();
      const extracted = this.stripContextAndExtractQuery(text);
      if (extracted) return extracted;
    }
    return undefined;
  }

  stripContextAndExtractQuery(text) {
    if (!text || !text.trim()) return undefined;
    let stripped = text.replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>\s*/g, '');
    if (/<user_query>([\s\S]*?)<\/user_query>/g.test(stripped)) {
      stripped = stripped.replace(/<user_query>([\s\S]*?)<\/user_query>/g, '$1');
    }
    for (const pattern of SYSTEM_CONTEXT_PATTERNS) stripped = stripped.replace(pattern, '');
    return stripped.trim() || undefined;
  }

  getSessionsHistoryDir(dbPath) {
    const projectsDir = path.join(path.dirname(dbPath), 'projects');
    return fs.existsSync(projectsDir) ? projectsDir : undefined;
  }
}

function parseTimestamp(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  return 0;
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function readFileSection(fd, offset, length) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
  return buffer.toString('utf8', 0, bytesRead);
}

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch { return undefined; }
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function isUserTitleCandidate(item) {
  if (item.type !== 'message' || item.role !== 'user') return false;
  const providerData = item.providerData;
  return !providerData?.skipRun
    && !providerData?.isCompactInternal
    && providerData?.agent !== 'compact'
    && typeof providerData?.teammateMessage?.from !== 'string';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

module.exports = Object.freeze({
  SYSTEM_CONTEXT_PATTERNS,
  SessionHistoryRecovery,
  isUserTitleCandidate,
  parseTimestamp,
});
