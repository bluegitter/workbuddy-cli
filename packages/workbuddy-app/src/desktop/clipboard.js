'use strict';

const { getDesktopHost } = require('./host');
async function writeClipboardText(text, fallback) { const writeText = getDesktopHost()?.clipboard?.writeText; if (typeof writeText === 'function') return writeText(text); if (fallback) return fallback(text); return undefined; }
async function writeClipboardImage(dataUrl, fallback) { const writeImage = getDesktopHost()?.clipboard?.writeImage; if (typeof writeImage === 'function') return writeImage(dataUrl); if (fallback) return fallback(dataUrl); return undefined; }

module.exports = Object.freeze({ writeClipboardText, writeClipboardImage });
