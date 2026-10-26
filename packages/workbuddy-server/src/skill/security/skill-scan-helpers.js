'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

async function runSkillPreCheck(selectedPath, securityClient, options = {}) { const logger = options.logger; const tempZipPath = path.join(os.tmpdir(), `workbuddy-skill-precheck-${Date.now()}-${process.pid}.zip`); try { let stat; try { stat = await fsp.stat(selectedPath); } catch (error) { return { md5: '', hashHit: false, scanResult: null, selectedPath, error: `Path not accessible: ${error.message || String(error)}` }; } if (stat.isDirectory()) await packDirectoryToZip(selectedPath, tempZipPath); else if (selectedPath.toLowerCase().endsWith('.zip')) await fsp.copyFile(selectedPath, tempZipPath); else return { md5: '', hashHit: false, scanResult: null, selectedPath, error: 'Selected path is not a directory or zip file' }; const md5 = await computeFileMd5(tempZipPath); let scanResult; try { scanResult = await securityClient.queryByMd5(md5, options.appKey); } catch (error) { return { md5, hashHit: false, scanResult: null, selectedPath, error: error.message || String(error) }; } if (scanResult !== null) return { md5, hashHit: true, scanResult, selectedPath }; const uploadZipPath = path.join(os.tmpdir(), `workbuddy-skill-upload-${Date.now()}-${process.pid}.zip`); try { await fsp.copyFile(tempZipPath, uploadZipPath); autoUploadInBackground(securityClient, uploadZipPath, options.appKey, logger); } catch (error) { logger?.warn?.('[SkillScanHelpers] failed to stage upload zip', error); } return { md5, hashHit: false, scanResult: null, selectedPath }; } finally { await fsp.rm(tempZipPath, { force: true }).catch(() => {}); } }
function autoUploadInBackground(securityClient, zipPath, appKey, logger) { Promise.resolve().then(() => securityClient.uploadForScan(zipPath, appKey)).then((result) => logger?.info?.(`[SkillScanHelpers] auto-upload completed: md5=${result.md5}`)).catch((error) => logger?.warn?.(`[SkillScanHelpers] auto-upload failed: ${error.message || String(error)}`)).finally(() => fsp.rm(zipPath, { force: true }).catch(() => {})); }
async function packDirectoryToZip(sourceDir, outputZip) { await execFileAsync('zip', ['-qr', outputZip, '.'], { cwd: sourceDir }); }
function computeFileMd5(filePath) { return new Promise((resolve, reject) => { const hash = crypto.createHash('md5'); const stream = fs.createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('end', () => resolve(hash.digest('hex'))); stream.on('error', reject); }); }

module.exports = { runSkillPreCheck, autoUploadInBackground, packDirectoryToZip, computeFileMd5 };
