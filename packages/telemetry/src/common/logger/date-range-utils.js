'use strict';

class DateRangeUtils {
  static last(days) { const end = new Date(); return { start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0], end: end.toISOString().split('T')[0] }; }
  static today() { const today = new Date().toISOString().split('T')[0]; return { start: today, end: today }; }
  static yesterday() { const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]; return { start: yesterday, end: yesterday }; }
  static toFilename(range) { return range.start === range.end ? range.start : `${range.start}+${range.end}`; }
  static toString(range) { return range.start === range.end ? range.start : `${range.start} to ${range.end}`; }
  static validate(range) { if (!range || typeof range.start !== 'string' || typeof range.end !== 'string') return false; const start = new Date(range.start).getTime(); const end = new Date(range.end).getTime(); return !Number.isNaN(start) && !Number.isNaN(end) && start <= end; }
}

module.exports = { DateRangeUtils };
