'use strict';

class DefaultUserinfoProvider {
  async provide() { return undefined; }
}

module.exports = { DefaultUserinfoProvider, UserinfoProvider: Symbol.for('workbuddy.runtime.UserinfoProvider') };
