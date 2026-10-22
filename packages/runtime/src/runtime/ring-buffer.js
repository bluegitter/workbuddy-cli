'use strict';

const { DEFAULT_RING_BUFFER_BYTES } = require('./sidecar-protocol');

class RingBuffer {
  constructor(capacity = DEFAULT_RING_BUFFER_BYTES) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive integer');
    this.buffer = Buffer.alloc(capacity);
    this.head = 0;
    this.filled = 0;
    this.total = 0;
  }

  write(data) {
    const input = Buffer.from(data);
    if (input.length === 0) return;
    if (input.length >= this.capacity) {
      input.copy(this.buffer, 0, input.length - this.capacity);
      this.head = 0;
      this.filled = this.capacity;
      this.total += input.length;
      return;
    }
    const spaceAtEnd = this.capacity - this.head;
    input.copy(this.buffer, this.head, 0, Math.min(input.length, spaceAtEnd));
    if (input.length > spaceAtEnd) input.copy(this.buffer, 0, spaceAtEnd);
    this.head = (this.head + input.length) % this.capacity;
    this.filled = Math.min(this.filled + input.length, this.capacity);
    this.total += input.length;
  }

  snapshot() {
    if (this.filled === 0) return Buffer.alloc(0);
    if (this.filled < this.capacity) return Buffer.from(this.buffer.subarray(0, this.filled));
    return Buffer.concat([this.buffer.subarray(this.head), this.buffer.subarray(0, this.head)]);
  }

  get totalWritten() { return this.total; }
  get currentFill() { return this.filled; }
  get capacity() { return this.buffer.length; }
}

module.exports = { RingBuffer };
