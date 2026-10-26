'use strict';

const fs = require('node:fs');
const dns = require('node:dns').promises;
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { resolveProxyFromEnv } = require('./proxy-resolver');

class NetworkDiagnosticsService {
  constructor(options = {}) { this.options = { logger: console, ...options }; this.reportDirectory = options.reportDirectory || path.join(os.tmpdir(), 'workbuddy-network'); this.latestResultFile = path.join(this.reportDirectory, 'latest.json'); }
  async runDiagnostics() {
    const config = await this.options.getRuntimeConfig(); const endpoint = new URL(config.endpoint); const proxy = await this.runProxyDiagnostics(resolveProxyFromEnv(config.endpoint)); const hosts = await this.runHostsDiagnostics(endpoint.hostname, this.getHostsFilePath()); const service = await this.runServiceDiagnostics(config.endpoint); const tcp = await this.runTcpDiagnostics(endpoint.hostname, this.getDefaultPort(endpoint.protocol, endpoint.port), resolveProxyFromEnv(config.endpoint)); const result = { isSupported: true, checkedAt: Date.now(), overallStatus: this.getOverallStatus([proxy, hosts, service, tcp]), overallSummary: this.getOverallSummary(this.getOverallStatus([proxy, hosts, service, tcp])), target: { endpoint: config.endpoint, baseEndpoint: config.baseEndpoint, host: endpoint.hostname, port: this.getDefaultPort(endpoint.protocol, endpoint.port), protocol: endpoint.protocol.replace(':', ''), prefixPath: config.prefixPath, platform: config.platform, proxyMode: this.getProxyModeLabel(resolveProxyFromEnv(config.endpoint)), hostsFilePath: this.getHostsFilePath() }, proxy, hosts, service, tcp }; result.report = this.buildReportContent(result); await this.persistLatestResult(result); return result;
  }
  async getLatestResult() { try { const result = JSON.parse(await fs.promises.readFile(this.latestResultFile, 'utf8')); return this.looksLikeResult(result) ? result : null; } catch { return null; } }
  async persistLatestResult(result) { try { await fs.promises.mkdir(this.reportDirectory, { recursive: true }); await fs.promises.writeFile(this.latestResultFile, JSON.stringify(result, null, 2), 'utf8'); } catch (error) { this.options.logger.warn?.('[NetworkDiagnosticsService] persist failed', error); } }
  looksLikeResult(value) { return Boolean(value && typeof value.checkedAt === 'number' && typeof value.overallStatus === 'string' && value.target && value.report); }
  async runProxyDiagnostics(info) { return { status: info.valid && info.mode !== 'none' ? 'warning' : 'success', summary: info.detail, value: this.getProxyModeLabel(info), ...(info.valid ? {} : { errorType: 'invalid-proxy-config' }) }; }
  async runHostsDiagnostics(host, hostsFile) { const addresses = await this.lookupAddresses(host); const entries = await this.readHostsEntries(host, hostsFile); return addresses.length ? { status: 'success', summary: entries.length ? 'hosts-mapped-resolved' : 'no-hosts-dns-ok', value: addresses.join(', ') } : { status: entries.length ? 'warning' : 'error', summary: entries.length ? 'hosts-mapped-unresolved' : 'dns-unresolved', value: host, errorType: 'dns-unresolved' }; }
  async runServiceDiagnostics(endpoint) { const started = Date.now(); try { await this.probeService(endpoint); return { status: 'success', summary: 'service-reachable', value: 'HTTP OK', durationMs: Date.now() - started }; } catch (error) { return { status: 'error', summary: 'service-unreachable', detail: this.getErrorMessage(error), value: 'HTTP Failed', durationMs: Date.now() - started, errorType: this.getErrorType(error) }; } }
  async runTcpDiagnostics(host, port) { const result = await this.measureTcpConnection(host, port, 3000); return result.ok ? { status: 'success', summary: 'tcp-connected', value: `${host}:${port}`, durationMs: result.durationMs } : { status: 'error', summary: 'tcp-connect-failed', detail: result.error, value: `${host}:${port}`, errorType: 'tcp-connect-failed' }; }
  measureTcpConnection(host, port, timeoutMs) { return new Promise((resolve) => { const started = Date.now(); const socket = net.connect({ host, port }); const finish = (result) => { socket.removeAllListeners(); socket.destroy(); resolve(result); }; socket.setTimeout(timeoutMs); socket.once('connect', () => finish({ ok: true, durationMs: Date.now() - started })); socket.once('timeout', () => finish({ ok: false, error: `Connection timed out after ${timeoutMs}ms.` })); socket.once('error', (error) => finish({ ok: false, error: this.getErrorMessage(error) })); }); }
  async lookupAddresses(host) { try { return (await dns.lookup(host, { all: true })).map((entry) => entry.address); } catch { return []; } }
  async readHostsEntries(host, hostsFile) { try { return (await fs.promises.readFile(hostsFile, 'utf8')).split('\n').filter((line) => !line.trim().startsWith('#') && line.split(/\s+/).slice(1).includes(host)).map((line) => line.trim()); } catch { return []; } }
  buildReportContent(result) { return `WorkBuddy Network Diagnostics\nChecked at: ${new Date(result.checkedAt).toISOString()}\nOverall: ${result.overallStatus}\nEndpoint: ${result.target.endpoint}\n`; }
  generateReport(result) { return this.buildReportContent(result); }
  getHostsFilePath() { return process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts') : '/etc/hosts'; }
  getDefaultPort(protocol, port) { return Number(port) || (protocol === 'http:' ? 80 : 443); }
  getProxyPort(protocol, port) { return this.getDefaultPort(protocol, port); }
  sanitizeUrlForDisplay(value) { try { const url = new URL(value); if (url.username) url.username = '***'; if (url.password) url.password = '***'; return url.toString(); } catch { return value; } }
  getOverallStatus(checks) { return checks.some((check) => check.status === 'error') ? 'error' : checks.some((check) => check.status === 'warning') ? 'warning' : 'success'; }
  getOverallSummary(status) { return status === 'success' ? 'Network is healthy' : status === 'warning' ? 'Network has warnings' : 'Network diagnostics found errors'; }
  getErrorMessage(error) { return error?.message || String(error); }
  getErrorType(error) { return error?.code || error?.name || 'network-error'; }
  getProxyModeLabel(info) { return info.mode === 'none' ? 'No proxy' : info.resolvedUrl ? this.sanitizeUrlForDisplay(info.resolvedUrl) : 'Proxy configured'; }
  async resolveProxy(endpoint) { return resolveProxyFromEnv(endpoint); }
  async probeService(endpoint) { const response = await fetch(endpoint, { method: 'HEAD', signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); }
  async measurePacketLoss() { return { unsupported: true, error: 'Packet loss probe is not enabled in this runtime.' }; }
  async runPacketLossDiagnostics() { return { status: 'unsupported', summary: 'packet-loss-unsupported', value: 'Ping unavailable', errorType: 'packet-loss-unsupported' }; }
}

function defaultHttpProbe(endpoint) { return fetch(endpoint, { method: 'HEAD' }); }
module.exports = { NetworkDiagnosticsService, defaultHttpProbe };
