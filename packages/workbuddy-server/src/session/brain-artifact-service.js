'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Tracks agent Write/Edit calls that produce files in WorkBuddy's brain or
 * plans directories and turns the completed call into an artifact event.
 */
class BrainArtifactService {
  constructor(options = {}) {
    this.options = options;
    this.pending = new Map();
  }

  onToolCall(sessionId, toolCallId, toolName, rawInput) {
    if (toolName !== 'Write' && toolName !== 'Edit') return;
    const filePath = rawInput?.file_path;
    if (!filePath || !this.isArtifactFilePath(filePath)) return;
    const artifact = this.buildArtifact(filePath, toolName, rawInput);
    if (artifact) this.pending.set(`${sessionId}:${toolCallId}`, {
      event: toolName === 'Write' ? 'created' : 'updated',
      artifact,
    });
  }

  onToolCallResult(sessionId, toolCallId, status) {
    const key = `${sessionId}:${toolCallId}`;
    const pending = this.pending.get(key);
    if (!pending) return null;
    this.pending.delete(key);
    if (status === 'failed') return null;
    return { sessionId, event: pending.event, artifact: pending.artifact };
  }

  getConfigDir() {
    return this.options.configDir?.trim()
      || process.env.CODEBUDDY_CONFIG_DIR?.trim()
      || process.env.WORKBUDDY_CONFIG_DIR?.trim()
      || path.join(os.homedir(), '.workbuddy');
  }

  getArtifactDirs() {
    const configDir = this.getConfigDir();
    return [path.join(configDir, 'brain'), path.join(configDir, 'plans')];
  }

  isArtifactFilePath(filePath) {
    const normalized = path.normalize(filePath);
    return this.getArtifactDirs().some((dir) => normalized.startsWith(dir));
  }

  determineContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)) return 'image';
    if (['.mp4', '.webm', '.mov', '.ogv'].includes(ext)) return 'video';
    if (['.mp3', '.wav', '.aac', '.ogg'].includes(ext)) return 'audio';
    if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext)) return 'document';
    if (['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)) return 'spreadsheet';
    if (['.pptx', '.ppt'].includes(ext)) return 'presentation';
    if (['.drawio', '.dio', '.excalidraw'].includes(ext)) return 'diagram';
    return 'code';
  }

  determineMimeType(filePath) {
    const mimeTypes = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
      '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
      '.pdf': 'application/pdf', '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain', '.md': 'text/markdown',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.ppt': 'application/vnd.ms-powerpoint', '.drawio': 'application/xml', '.dio': 'application/xml',
      '.excalidraw': 'application/json', '.html': 'text/html', '.htm': 'text/html',
      '.js': 'text/javascript', '.jsx': 'text/jsx', '.ts': 'text/typescript', '.tsx': 'text/tsx',
      '.vue': 'text/x-vue', '.css': 'text/css', '.scss': 'text/x-scss', '.less': 'text/x-scss',
      '.py': 'text/x-python', '.java': 'text/x-java', '.go': 'text/x-go', '.php': 'text/x-php',
      '.rb': 'text/x-ruby', '.rs': 'text/x-rustsrc', '.cs': 'text/x-csharp', '.kt': 'text/x-kotlin',
      '.c': 'text/x-csrc', '.cpp': 'text/x-c++src', '.h': 'text/x-chdr', '.swift': 'text/x-swift',
      '.dart': 'text/x-dart', '.lua': 'text/x-lua', '.r': 'text/x-rsrc', '.json': 'application/json',
      '.yaml': 'application/x-yaml', '.yml': 'application/x-yaml', '.xml': 'application/xml',
      '.toml': 'text/plain', '.ini': 'text/plain', '.env': 'text/plain', '.sh': 'text/x-sh',
      '.bash': 'text/x-sh', '.bat': 'text/plain', '.ps1': 'text/plain', '.sql': 'text/x-sql',
      '.log': 'text/plain',
    };
    return mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  }

  isOverviewExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.txt';
  }

  buildArtifact(filePath, toolName, rawInput) {
    const fileName = path.basename(filePath);
    const contentType = this.determineContentType(filePath);
    const mimeType = this.determineMimeType(filePath);
    if (!this.isOverviewExtension(filePath)) return {
      type: 'media', uri: pathToFileURL(filePath).href, name: fileName, title: fileName, mimeType, contentType,
    };

    let content;
    if (toolName === 'Write') content = typeof rawInput?.content === 'string' ? rawInput.content : undefined;
    else {
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { /* The edit may create the file asynchronously. */ }
    }
    const ext = path.extname(filePath);
    const name = ext ? path.basename(filePath, ext) : fileName;
    let title = name;
    if (content) {
      const heading = content.match(/^#\s+(.+)$/m);
      if (heading) title = heading[1].trim();
    }
    return {
      type: path.normalize(filePath).startsWith(path.join(this.getConfigDir(), 'plans')) ? 'plan' : 'overview',
      uri: pathToFileURL(filePath).href,
      name,
      title,
      mimeType: 'text/markdown',
      text: content,
      enableEdit: true,
    };
  }
}

module.exports = Object.freeze({ BrainArtifactService });
