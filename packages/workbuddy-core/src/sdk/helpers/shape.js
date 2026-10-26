'use strict';

function wrapArray(array, extra) {
  return { items: array ?? [], ...(extra ?? {}) };
}

module.exports = Object.freeze({ wrapArray });
