'use strict';

const FILE_TREE_IGNORED_EXACT_NAMES = new Set([
  '.DS_Store', '.AppleDouble', '.LSOverride', '.Spotlight-V100', '.Trashes', '.localized',
  'Thumbs.db', 'ehthumbs.db', 'desktop.ini', '$RECYCLE.BIN', '.git', '.svn', '.hg', 'CVS',
]);
const FILE_TREE_IGNORED_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.pyd', '.class', '.swp', '.swo', '.bak', '.tmp', '.o', '.obj',
]);
const FILE_TREE_IGNORED_PREFIXES = ['._', '~$'];

function isFileTreeIgnoredEntry(name) {
  if (!name) return false;
  if (FILE_TREE_IGNORED_EXACT_NAMES.has(name)) return true;
  for (const prefix of FILE_TREE_IGNORED_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex > 0 && FILE_TREE_IGNORED_EXTENSIONS.has(name.slice(dotIndex).toLowerCase())) return true;
  return false;
}

module.exports = Object.freeze({
  FILE_TREE_IGNORED_EXACT_NAMES,
  FILE_TREE_IGNORED_EXTENSIONS,
  FILE_TREE_IGNORED_PREFIXES,
  isFileTreeIgnoredEntry,
});
