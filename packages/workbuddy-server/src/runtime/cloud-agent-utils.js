'use strict';

function normalizeCloudAgentListItem(item) {
  const raw = item || {};
  if (raw.manifest && !raw.currentVersion?.manifest) return { ...raw, currentVersion: { ...raw.currentVersion, manifest: raw.manifest } };
  return item;
}

function encodePath(value) { return encodeURIComponent(String(value)); }

function safeParseBigIntJSON(text) {
  const processed = String(text).replace(/:(\s*)(\d{16,})(\s*[,}\]])/g, (_full, spacing, number, suffix) => `:${spacing}"${number}"${suffix}`);
  return JSON.parse(processed);
}

module.exports = Object.freeze({ normalizeCloudAgentListItem, encodePath, safeParseBigIntJSON });
