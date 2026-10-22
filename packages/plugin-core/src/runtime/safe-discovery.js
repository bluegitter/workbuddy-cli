'use strict';

const fs = require('fs');
const path = require('path');

const MAX_SCAN_DEPTH = 5;

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function scanSkillFiles(root, { maxDepth = MAX_SCAN_DEPTH, followSymlinks = false } = {}) {
  const results = [];
  const visit = (directory, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink() && !followSymlinks) continue;
      if (entry.isFile() && entry.name === 'SKILL.md') results.push(fullPath);
      else if (entry.isDirectory()) visit(fullPath, depth + 1);
    }
  };
  visit(path.resolve(root), 0);
  return results;
}

function mergeMarketplaceManifests(base = {}, overlays = []) {
  const plugins = new Map((base.plugins || []).filter((plugin) => plugin?.source).map((plugin) => [plugin.source, plugin]));
  for (const overlay of overlays || []) for (const plugin of overlay?.plugins || []) if (plugin?.source) plugins.set(plugin.source, plugin);
  return { ...base, plugins: [...plugins.values()] };
}

function validatePluginManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { valid: false, errors: ['manifest must be an object'] };
  const errors = [];
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) errors.push('name is required');
  if (manifest.version !== undefined && typeof manifest.version !== 'string') errors.push('version must be a string');
  if (manifest.skills !== undefined && !Array.isArray(manifest.skills)) errors.push('skills must be an array');
  return { valid: errors.length === 0, errors };
}

module.exports = { MAX_SCAN_DEPTH, isInside, mergeMarketplaceManifests, scanSkillFiles, validatePluginManifest };
