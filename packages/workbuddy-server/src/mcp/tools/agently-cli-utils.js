'use strict';

const childProcess = require('node:child_process');
const util = require('node:util');

const execFileAsync = util.promisify(childProcess.execFile);
const AGENTLY_CLI_SEGMENTS = ['builtin-mcp-apps', 'agently-cli', 'bin', process.platform === 'win32' ? 'agently-cli.exe' : 'agently-cli'];
const AGENTMAIL_UNAVAILABLE_TEXTS = Object.freeze({
  not_bound: 'Agent 邮箱尚未开通。请引导用户在上方开通面板中完成开通，当前请勿重试。',
  deactivated: 'Agent 邮箱已被用户主动停用，请引导用户重新启用，当前请勿重试。',
  auth_failed: 'Agent 邮箱授权已失效，请引导用户重新授权，当前请勿重试。',
  suspended: 'Agent 邮箱已被临时冻结，请引导用户查看冻结原因，当前请勿重试。',
  banned: 'Agent 邮箱已被封禁，无法继续使用，当前请勿重试。',
  deleted: 'Agent 邮箱主账号已注销，请重新开通，当前请勿重试。',
  revoked: 'Agent 邮箱授权已解绑，请重新绑定，当前请勿重试。'
});
function resolveBuiltinAgentlyCliPath(deps) { return deps?.resolveBundledAsset?.(...AGENTLY_CLI_SEGMENTS); }
async function getAgentMailAccessToken(deps) { const response = await deps.callConnectorOauthApi('GET', '/console/as/connector/oauth/agentmail/accesstoken', deps); if (response?.code === 0 && response.data?.access_token) return response.data.access_token; throw new Error(`Failed to get agent-mail access token: ${response?.msg || response?.data?.message || 'Unknown error'}`); }
function parseCliOutput(stdout) { const trimmed = String(stdout || '').trim(); if (!trimmed) throw new Error('agently-cli returned empty output'); try { const parsed = JSON.parse(trimmed); return { ok: !!parsed.ok, data: parsed.data ?? undefined, error: parsed.error ?? undefined }; } catch { throw new Error(`agently-cli returned non-JSON output: ${trimmed.slice(0, 500)}`); } }
async function execAgentlyCli(args, options) { const cliPath = resolveBuiltinAgentlyCliPath(options); if (!cliPath) throw new Error('Attachment service is unavailable. The required CLI component is missing.'); try { const { stdout } = await execFileAsync(cliPath, args, { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, AGENTLY_ACCESS_TOKEN: options.token } }); return parseCliOutput(stdout); } catch (error) { if (error.killed || error.code === 'ETIMEDOUT') throw new Error(`agently-cli timed out after ${options.timeoutMs}ms`); if (error.stdout) try { return parseCliOutput(error.stdout); } catch {} throw new Error(`agently-cli failed: ${error.stderr || error.message || 'Unknown CLI error'}`); } }
async function getAgentMailStatus(deps) { try { const response = await deps.callConnectorOauthApi('GET', '/v2/as/connector/agentmail/me', deps); const status = response?.data?.status; return typeof status === 'string' ? { status, alias: response.data.alias ?? undefined } : null; } catch { return null; } }
function buildAgentmailUnavailableResult(status) { let text = AGENTMAIL_UNAVAILABLE_TEXTS[status] || `Agent 邮箱不可用 (status=${status})，当前请勿重试。`; if (status === 'not_bound') text += `\n${JSON.stringify({ _agentmail_meta: { errorReason: 'agentmail_unavailable', status } })}`; return { content: [{ type: 'text', text }], isError: true }; }

module.exports = Object.freeze({ AGENTLY_CLI_SEGMENTS, AGENTMAIL_UNAVAILABLE_TEXTS, buildAgentmailUnavailableResult, execAgentlyCli, getAgentMailAccessToken, getAgentMailStatus, parseCliOutput, resolveBuiltinAgentlyCliPath });
