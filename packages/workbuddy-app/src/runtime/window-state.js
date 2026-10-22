'use strict';

class WindowState {
  constructor(initial = {}) { this.value = { visible: false, maximized: false, ...initial }; }
  update(patch) { this.value = { ...this.value, ...patch }; return this.value; }
  show() { return this.update({ visible: true }); }
  hide() { return this.update({ visible: false }); }
}

module.exports = { WindowState };
