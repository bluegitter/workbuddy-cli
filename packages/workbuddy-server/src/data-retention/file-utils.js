'use strict';
const fs = require('node:fs');
const path = require('node:path');
async function walkDirectorySize(root) { let total = 0; const entries = await fs.promises.readdir(root, { withFileTypes: true }); for (const entry of entries) { const entryPath = path.join(root, entry.name); try { if (entry.isSymbolicLink()) continue; if (entry.isDirectory()) total += await walkDirectorySize(entryPath); else if (entry.isFile()) total += (await fs.promises.stat(entryPath)).size; } catch (error) { if (error?.code !== 'ENOENT') throw error; } } return total; }
function safeJoinWithin(root, ...segments) { const resolvedRoot = path.resolve(root); const target = path.resolve(resolvedRoot, ...segments); const relative = path.relative(resolvedRoot, target); return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? target : null; }
module.exports = Object.freeze({ walkDirectorySize, safeJoinWithin });
