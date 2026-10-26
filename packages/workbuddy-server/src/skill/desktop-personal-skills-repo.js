'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { enrichSkillUploadOptions } = require('./common/skill-upload-metadata');
const { CloudPersonalSkillsRepo } = require('./common/cloud-personal-skills-repo');

/** Desktop-only adapter for UploadCustomSkillFileRef values crossing IPC. */
class DesktopPersonalSkillsRepo extends CloudPersonalSkillsRepo {
  constructor({ context, ...deps } = {}) {
    const logsDir = context?.homeDir ? path.join(context.homeDir, 'logs') : undefined;
    const logWriter = logsDir ? {
      append(relativePath, line) {
        try {
          const filePath = path.join(logsDir, relativePath);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.appendFileSync(filePath, line);
        } catch {
          // Diagnostics must never break a skill request.
        }
      },
    } : undefined;
    super({ context, ...deps, logWriter });
  }

  getMultipartHttpConfig() {
    // The desktop fetch adapter detects the streaming Blob and supplies the
    // multipart boundary itself.
    return undefined;
  }

  async uploadCustomSkill(params = {}) {
    const file = params.file;
    const fileName = file?.name;
    if (!fileName) throw new Error('upload custom skill requires a file name');
    const enriched = await enrichSkillUploadOptions({
      baseName: fileName.replace(/\.(zip|tar\.gz|tgz|skill)$/i, ''),
      blob: await this.resolveUploadFile(file),
      filePath: typeof file?.filePath === 'string' ? file.filePath : undefined,
      options: {
        name: params.name,
        title: params.title,
        description: params.description,
        version: params.version,
      },
    });
    return super.uploadCustomSkill({ ...params, ...enriched });
  }

  async resolveUploadFile(file) {
    if (!file || typeof file !== 'object' || !('filePath' in file)) return super.resolveUploadFile(file);
    const buffer = await fsp.readFile(file.filePath);
    return new Blob([buffer], file.type ? { type: file.type } : undefined);
  }
}

module.exports = Object.freeze({ DesktopPersonalSkillsRepo });
