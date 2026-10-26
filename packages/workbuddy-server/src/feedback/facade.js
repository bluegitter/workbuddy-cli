'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function resolveLogsDir(configDir, ...segments) { return path.join(configDir, 'logs', ...segments); }
function getUrlHost(url) { if (!url) return ''; try { return new URL(url).host; } catch { return 'invalid-url'; } }

function createFeedbackFacade(deps) { return { submit: (params) => submitUserFeedback(deps, params) }; }

async function collectTodayLogs(deps, formData) {
  const logFilePath = deps.getLogFilePath?.();
  const primaryLogsDir = logFilePath ? path.dirname(logFilePath) : resolveLogsDir(deps.configDir);
  const logsDir = resolveLogsDir(deps.configDir);
  const candidates = [logsDir, path.join(logsDir, 'perf'), path.join(logsDir, 'update'), path.join(logsDir, 'migration'), path.join(os.homedir(), '.codebuddy', 'logs')];
  const extraLogDirs = [];
  for (const candidate of candidates) try { await fs.promises.access(candidate); extraLogDirs.push(candidate); } catch {}
  const zipPath = await deps.packageLogs(primaryLogsDir, { extraLogDirs, todayOnly: true, maxAgeDays: 1 });
  const buffer = await fs.promises.readFile(zipPath);
  formData.append('log', new Blob([buffer], { type: 'application/zip' }), path.basename(zipPath));
  return zipPath;
}

async function submitUserFeedback(deps, params) {
  const logger = deps.logger || console;
  let autoLogZipPath;
  try {
    const formData = new FormData();
    formData.append('content', params.content);
    formData.append('client_type', params.clientType);
    formData.append('platform', params.platform);
    if (params.clientVersion) formData.append('client_version', params.clientVersion);
    for (const image of params.images || []) try { formData.append('images', new Blob([Buffer.from(image.base64, 'base64')], { type: image.type }), image.name); } catch (error) { logger.error(`[FeedbackFacade] Failed to decode image ${image.name}: ${error}`); }
    if (params.logFile) try { formData.append('log', new Blob([Buffer.from(params.logFile.base64, 'base64')], { type: params.logFile.type || 'application/zip' }), params.logFile.name); } catch (error) { logger.error(`[FeedbackFacade] Failed to decode log file: ${error}`); }
    else if (params.includeLog === true) try { autoLogZipPath = await collectTodayLogs(deps, formData); } catch (error) { logger.error(`[FeedbackFacade] Failed to collect today logs: ${error}`); }

    const headers = { 'X-Machine-Id': params.machineId };
    if (params.userId) headers['X-User-Id'] = params.userId;
    const token = deps.authService?.getToken?.();
    const account = deps.authService?.getAccount?.();
    const session = deps.authenticationManager?.currentSessionSubject?.getValue?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (account?.enterpriseId) { headers['X-Enterprise-Id'] = account.enterpriseId; headers['X-Tenant-Id'] = account.enterpriseId; }
    const endpoint = deps.productManager?.getEndpoint?.();
    const domain = session?.auth?.domain || getUrlHost(endpoint);
    if (domain) headers['X-Domain'] = domain;
    if (!endpoint) return { success: false, error: 'Product endpoint unavailable', errorCode: 500 };
    const response = await deps.fetch(`${endpoint}/v2/feedback`, { method: 'POST', headers, body: formData });
    if (!response.ok) return { success: false, error: `HTTP ${response.status}: ${response.statusText}`, errorCode: response.status };
    let json; try { json = await response.json(); } catch { return { success: false, error: 'Failed to parse response JSON', errorCode: 500 }; }
    if (json.code !== 0) return { success: false, error: json.msg || 'Unknown error', errorCode: json.code };
    return { success: true, feedbackId: json.data?.feedback_id };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error', errorCode: 500 }; }
  finally { if (autoLogZipPath) try { await fs.promises.unlink(autoLogZipPath); } catch {} }
}

module.exports = { createFeedbackFacade, submitUserFeedback, collectTodayLogs, resolveLogsDir, getUrlHost };
