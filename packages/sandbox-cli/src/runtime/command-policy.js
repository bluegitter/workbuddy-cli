'use strict';

const path = require('path');

class CommandPolicy {
  constructor({ cwd = process.cwd(), writableRoots = [], deniedCommands = [] } = {}) {
    this.cwd = path.resolve(cwd);
    this.writableRoots = writableRoots.map((root) => path.resolve(this.cwd, root));
    this.deniedCommands = deniedCommands;
  }

  check(command, targetPath) {
    const denied = this.deniedCommands.find((pattern) => pattern.test(command));
    if (denied) return { allowed: false, reason: `command denied by policy: ${denied}` };
    if (!targetPath) return { allowed: true };
    const resolved = path.resolve(this.cwd, targetPath);
    const writable = this.writableRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
    return writable ? { allowed: true, resolved } : { allowed: false, reason: `path is outside writable roots: ${resolved}` };
  }
}

module.exports = { CommandPolicy };
