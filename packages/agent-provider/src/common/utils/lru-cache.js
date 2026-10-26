'use strict';

class LRUCache {
  constructor(capacity) { if (!Number.isFinite(capacity) || capacity <= 0) throw new Error('Cache capacity must be greater than 0'); this.capacity = capacity; this.cache = new Map(); }
  get(key) { if (!this.cache.has(key)) return undefined; const value = this.cache.get(key); this.cache.delete(key); this.cache.set(key, value); return value; }
  set(key, value) { if (this.cache.has(key)) this.cache.delete(key); else if (this.cache.size >= this.capacity) this.cache.delete(this.cache.keys().next().value); this.cache.set(key, value); }
  has(key) { return this.cache.has(key); }
  delete(key) { return this.cache.delete(key); }
  clear() { this.cache.clear(); }
  get size() { return this.cache.size; }
  get maxSize() { return this.capacity; }
  keys() { return [...this.cache.keys()]; }
  values() { return [...this.cache.values()]; }
  forEach(callback) { this.cache.forEach((value, key) => callback(value, key)); }
}

module.exports = Object.freeze({ LRUCache });
