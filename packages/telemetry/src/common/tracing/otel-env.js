'use strict';

const TRACES_PATH = '/v1/traces';
const ENABLE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
function isTruthy(value) { return ENABLE_TRUE_VALUES.has(String(value ?? '').trim().toLowerCase()); }
function readEnableFlag(env) { const raw = env.CODEBUDDY_CODE_ENABLE_TELEMETRY ?? env.CLAUDE_CODE_ENABLE_TELEMETRY; return raw === undefined ? false : isTruthy(raw); }
function stripTrailingSlash(url) { return url.endsWith('/') ? url.slice(0, -1) : url; }
function readExporter(env, warnings) { const raw = env.OTEL_TRACES_EXPORTER; if (!raw) return undefined; const normalized = raw.trim().toLowerCase(); if (normalized === 'otlp' || normalized === 'console' || normalized === 'none') return normalized; warnings.push(`OTEL_TRACES_EXPORTER=${raw} is not supported, fallback to default. Supported: otlp, console, none.`); return undefined; }
function readEndpoint(env) { const traces = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim(); if (traces) return stripTrailingSlash(traces); const generic = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim(); return generic ? `${stripTrailingSlash(generic)}${TRACES_PATH}` : undefined; }
function parseKeyValueList(raw) { if (!raw) return undefined; const result = {}; for (const segment of raw.split(',')) { const trimmed = segment.trim(); if (!trimmed) continue; const equals = trimmed.indexOf('='); if (equals <= 0) continue; const key = trimmed.slice(0, equals).trim(); const valueRaw = trimmed.slice(equals + 1).trim(); if (!key) continue; let value = valueRaw; try { value = decodeURIComponent(valueRaw); } catch {} result[key] = value; } return Object.keys(result).length ? result : undefined; }
function readHeaders(env) { return parseKeyValueList(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS) ?? parseKeyValueList(env.OTEL_EXPORTER_OTLP_HEADERS); }
function readProtocol(env, warnings) { const raw = env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ?? env.OTEL_EXPORTER_OTLP_PROTOCOL; if (!raw) return undefined; if (raw.trim().toLowerCase() === 'http/protobuf') return 'http/protobuf'; warnings.push(`OTEL exporter protocol "${raw}" is not supported in current build, fallback to http/protobuf. Supported: http/protobuf.`); return undefined; }
function readOtelLoggingFlags(env = process.env) { return { logUserPrompts: isTruthy(env.OTEL_LOG_USER_PROMPTS), logToolDetails: isTruthy(env.OTEL_LOG_TOOL_DETAILS), logToolContent: isTruthy(env.OTEL_LOG_TOOL_CONTENT), logRawApiBodies: isTruthy(env.OTEL_LOG_RAW_API_BODIES) }; }
function readOtelTraceEnv(env = process.env) { const warnings = []; return { enabledByEnv: readEnableFlag(env), exporter: readExporter(env, warnings), endpoint: readEndpoint(env), headers: readHeaders(env), protocol: readProtocol(env, warnings), serviceName: env.OTEL_SERVICE_NAME?.trim() || undefined, resourceAttributes: parseKeyValueList(env.OTEL_RESOURCE_ATTRIBUTES), ...readOtelLoggingFlags(env), warnings }; }

module.exports = { ENABLE_TRUE_VALUES, TRACES_PATH, isTruthy, parseKeyValueList, readEnableFlag, readEndpoint, readExporter, readHeaders, readOtelLoggingFlags, readOtelTraceEnv, readProtocol, stripTrailingSlash };
