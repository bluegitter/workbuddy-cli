'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MIN_CONNECT_TIMEOUT_MS = 60_000;
const STDIO_MIN_CONNECT_TIMEOUT_MS = 120_000;
const HANDSHAKE_TIMEOUT_MS = 12_000;
const SKIP_FALLBACK_PATTERNS = [/\b401\b/i, /\b403\b/i, /unauthorized/i, /\baborted\b/i];
const NODE_AUTO_FALLBACK_COMMANDS = new Set(['node', 'npm', 'npx']);

function parseTimeoutMs(configTimeout) { return configTimeout ? configTimeout < 1000 ? configTimeout * 1000 : configTimeout : 0; }
function isStdioServerConfig(config) { return Boolean(config?.command || config?.type === 'stdio'); }
function getMinimumTimeout(config) { return isStdioServerConfig(config) ? STDIO_MIN_CONNECT_TIMEOUT_MS : MIN_CONNECT_TIMEOUT_MS; }
function getConnectTimeout(config = {}) { return Math.max(getMinimumTimeout(config), parseTimeoutMs(config.timeout)); }
function isManagedAuthConfig(config) { return config?._workbuddyManagedAuth === 'enterprise' || config?._workbuddyManagedAuth === 'server-side'; }
function sanitizeRuntimeDirName(configId) { return `${String(configId).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'mcp-server'}-${crypto.createHash('sha256').update(String(configId)).digest('hex').slice(0, 8)}`; }
function getWorkbuddyConfigDir(env = process.env, homeDir = os.homedir()) { return env.WORKBUDDY_CONFIG_DIR?.trim() || env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(homeDir, '.workbuddy'); }
function ensureDirectory(cwd, configId, fsApi = fs) { const resolved = path.resolve(cwd); if (fsApi.existsSync(resolved)) { if (!fsApi.statSync(resolved).isDirectory()) throw new Error(`Configured cwd for MCP server "${configId}" is not a directory: ${resolved}`); return resolved; } try { fsApi.mkdirSync(resolved, { recursive: true }); } catch (error) { throw new Error(`Configured cwd for MCP server "${configId}" could not be created at ${resolved}: ${error instanceof Error ? error.message : String(error)}`); } return resolved; }
function resolveStdioCwd(configId, serverConfig = {}, options = {}) { const base = options.configDir || getWorkbuddyConfigDir(options.env, options.homeDir); const defaultCwd = path.join(base, 'logs', 'mcp-runtime', sanitizeRuntimeDirName(configId)); fs.mkdirSync(defaultCwd, { recursive: true }); const configured = typeof serverConfig.cwd === 'string' ? serverConfig.cwd.trim() : ''; if (!configured) return defaultCwd; return ensureDirectory(path.isAbsolute(configured) ? configured : path.join(defaultCwd, configured), configId, options.fsApi || fs); }
function resolveTransportOrder(serverConfig = {}) { const explicit = String(serverConfig.type ?? '').toLowerCase(); const legacy = String(serverConfig.transportType ?? '').toLowerCase(); if (explicit === 'sse' || (!explicit && legacy === 'sse')) return { order: 'sse-first', source: explicit ? 'type' : 'transportType' }; if (explicit === 'streamablehttp' || explicit === 'http') return { order: 'stream-first', source: 'type' }; return { order: 'stream-first', source: 'default' }; }
function shouldSkipFallback(error) { const message = error instanceof Error ? error.message : String(error); return SKIP_FALLBACK_PATTERNS.some((pattern) => pattern.test(message)); }
function captureResourceMetadataUrl(transport) { const raw = transport?._resourceMetadataUrl; if (!raw) return undefined; if (typeof raw === 'string' && raw.length) return raw; if (raw instanceof URL) return raw.toString(); const value = String(raw); return value && value !== '[object Object]' ? value : undefined; }
function resolveServiceProxyUrl(base) { return base ? `${String(base).replace(/\/+$/, '')}/internal/hooks/services/invoke` : undefined; }

module.exports = { MIN_CONNECT_TIMEOUT_MS, STDIO_MIN_CONNECT_TIMEOUT_MS, HANDSHAKE_TIMEOUT_MS, SKIP_FALLBACK_PATTERNS, NODE_AUTO_FALLBACK_COMMANDS, parseTimeoutMs, isStdioServerConfig, getMinimumTimeout, getConnectTimeout, isManagedAuthConfig, sanitizeRuntimeDirName, getWorkbuddyConfigDir, ensureDirectory, resolveStdioCwd, resolveTransportOrder, shouldSkipFallback, captureResourceMetadataUrl, resolveServiceProxyUrl };
