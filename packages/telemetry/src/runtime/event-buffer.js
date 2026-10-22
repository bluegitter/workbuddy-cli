'use strict';

class EventBuffer {
  constructor({ capacity = 1000, sink = async () => {} } = {}) {
    this.capacity = capacity;
    this.sink = sink;
    this.events = [];
  }

  push(event, attributes = {}) {
    this.events.push({ event, attributes, timestamp: Date.now() });
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity);
  }

  async flush() {
    if (!this.events.length) return;
    const pending = this.events.splice(0);
    try { await this.sink(pending); } catch (error) { this.events.unshift(...pending); throw error; }
  }
}

module.exports = { EventBuffer };
