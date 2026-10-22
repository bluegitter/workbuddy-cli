#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = path.resolve(__dirname, '..');
const packages = fs.readdirSync(path.join(root, 'packages'))
  .filter((name) => fs.statSync(path.join(root, 'packages', name)).isDirectory());
for (const name of packages) {
  const packageRoot = path.join(root, 'packages', name);
  JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  require(path.join(packageRoot, 'src', 'index.js'));
  const sourceRoot = path.join(packageRoot, 'src', 'source');
  if (!fs.existsSync(sourceRoot)) continue;
  for (const file of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (file.isFile() && file.name.endsWith('.js')) {
      childProcess.execFileSync(process.execPath, ['--check', path.join(packageRoot, 'src', 'source', file.name)], { stdio: 'inherit' });
    }
  }
}
console.log(`validated ${packages.length} package source boundaries`);
