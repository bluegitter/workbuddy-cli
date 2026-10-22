'use strict';

const fs = require('fs');
const path = require('path');

function loadPlugin(directory) {
  const candidates = [path.join(directory, '.codebuddy-plugin', 'plugin.json'), path.join(directory, 'plugin.json')];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) throw new Error(`plugin manifest not found: ${directory}`);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...manifest, directory, manifestFile: file };
}

function discoverPlugins(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => { try { return [loadPlugin(path.join(root, entry.name))]; } catch { return []; } });
}

module.exports = { discoverPlugins, loadPlugin };
