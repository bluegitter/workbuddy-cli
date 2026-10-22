'use strict';

const path = require('path');

class PathPolicy {
  constructor({ roots = [], mode = 'default' } = {}) {
    this.roots = roots.map((root) => path.resolve(root));
    this.mode = mode;
  }

  allows(candidate) {
    if (this.mode === 'bypassPermissions') return true;
    const resolved = path.resolve(candidate);
    return this.roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  }

  assert(candidate) {
    if (!this.allows(candidate)) throw new Error(`path blocked by enterprise policy: ${candidate}`);
    return path.resolve(candidate);
  }
}

module.exports = { PathPolicy };
