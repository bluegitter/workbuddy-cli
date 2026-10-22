'use strict';

function toHeaderRecord(headers) {
  if (!headers) return {};
  if (typeof headers.forEach === 'function') {
    const result = {};
    headers.forEach((value, key) => { result[key] = value; });
    return result;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [String(key), String(value)]));
  if (typeof headers === 'object') return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
  return {};
}

/** Temporarily applies request headers to an MCP client's HTTP transport. */
async function withExtraHeaders(client, headers, operation) {
  if (!headers || Object.keys(headers).length === 0) return operation();
  const transport = client?._transport;
  if (!transport || typeof transport !== 'object') return operation();
  const previous = transport._requestInit;
  transport._requestInit = { ...previous, headers: { ...toHeaderRecord(previous?.headers), ...headers } };
  try {
    return await operation();
  } finally {
    transport._requestInit = previous;
  }
}

module.exports = { toHeaderRecord, withExtraHeaders };
