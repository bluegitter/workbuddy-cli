'use strict';

class SessionPoiCache {
  constructor() { this.cache = new Map(); }
  set(sessionId, poi) { this.cache.set(sessionId, poi); }
  get(sessionId) { return this.cache.get(sessionId); }
  delete(sessionId) { return this.cache.delete(sessionId); }
  clear() { this.cache.clear(); }
  get size() { return this.cache.size; }
}

module.exports = { SessionPoiCache };
