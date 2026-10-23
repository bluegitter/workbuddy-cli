'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_TOGGLE_WINDOW_ACCELERATOR = 'Shift+Alt+W';

function loadToggleWindowAccelerator(filePath, {
  readFileSync = fs.readFileSync,
  defaultAccelerator = DEFAULT_TOGGLE_WINDOW_ACCELERATOR,
} = {}) {
  try {
    const state = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (state.version !== 1 || typeof state.toggleWindowAccelerator !== 'string') {
      return defaultAccelerator;
    }
    return state.toggleWindowAccelerator;
  } catch {
    return defaultAccelerator;
  }
}

function saveToggleWindowAccelerator(filePath, accelerator, {
  mkdirSync = fs.mkdirSync,
  writeFileSync = fs.writeFileSync,
  dirname = path.dirname,
  logger = console,
} = {}) {
  try {
    const state = {
      version: 1,
      toggleWindowAccelerator: accelerator,
    };
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state));
  } catch (error) {
    logger.warn('[shortcut-state] Failed to save shortcut state:', error);
  }
}

module.exports = {
  DEFAULT_TOGGLE_WINDOW_ACCELERATOR,
  loadToggleWindowAccelerator,
  saveToggleWindowAccelerator,
};
