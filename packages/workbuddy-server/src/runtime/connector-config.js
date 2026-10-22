'use strict';

function connectorSource(entry = {}) { return entry.source || entry.name; }

function buildConnectorConfig(entry = {}, options = {}) {
  const source = connectorSource(entry);
  if (!source) return undefined;
  const type = entry.type || 'mcp';
  const base = {
    id: source,
    source,
    name: entry.name || source,
    description: entry.description,
    type,
    authMode: entry.auth_mode,
    icon: entry.icon,
  };
  if (type === 'skill-only') return { ...base, skills: options.skills || [] };
  if (type === 'cli') return { ...base, command: entry.command, args: entry.args || [], auth: entry.auth, skills: options.skills || [] };
  const servers = options.mcpServers || {};
  const first = Object.values(servers)[0] || {};
  return {
    ...base,
    mcpServers: servers,
    url: first.url || '',
    headers: first.headers,
    env: first.env,
    skills: options.skills || [],
  };
}

function connectorEntries(manifest = {}, options = {}) {
  return (manifest.connectors || []).map((entry) => buildConnectorConfig(entry, options.bySource?.[connectorSource(entry)] || {})).filter(Boolean);
}

module.exports = { buildConnectorConfig, connectorEntries, connectorSource };
