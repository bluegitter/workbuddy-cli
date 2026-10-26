'use strict';

const { getDesktopHost } = require('./host');
const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set(['http:', 'https:', 'x-apple.systempreferences:', 'ms-settings:']);
function readExternalUrl(value) { try { const url = new URL(value); if (ALLOWED_EXTERNAL_URL_PROTOCOLS.has(url.protocol)) return value; } catch {} throw new Error('Unsupported external URL'); }
function isElectronRenderer(navigatorObject = globalThis.navigator) { return Boolean(navigatorObject && /\bElectron\//i.test(navigatorObject.userAgent)); }
function isFileUrl(url) { try { return new URL(url).protocol === 'file:'; } catch { return false; } }
function fileUrlToLocalPath(url) { try { const parsed = new URL(url); let pathname = decodeURIComponent(parsed.pathname); if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1); return pathname; } catch { return decodeURIComponent(url.replace(/^file:\/+/, '')); } }
async function openLocalFile(path, mode) { const open = getDesktopHost()?.localFile?.open; if (typeof open !== 'function') throw new Error('Desktop localFile host is unavailable'); await open({ path, mode }); }
async function openDesktopLocalFile(path) { return openLocalFile(path, 'open'); }
async function revealDesktopLocalFile(path) { return openLocalFile(path, 'reveal'); }
async function openExternalUrl(url) {
  if (isFileUrl(url)) {
    const path = fileUrlToLocalPath(url); const localOpen = getDesktopHost()?.localFile?.open; if (typeof localOpen === 'function') return localOpen({ path, mode: 'open' });
  }
  const target = isFileUrl(url) ? url : readExternalUrl(url); const openUrl = getDesktopHost()?.opener?.openUrl; if (typeof openUrl === 'function') return openUrl(target);
  if (!isElectronRenderer() && typeof globalThis.window?.open === 'function') return globalThis.window.open(target, '_blank', 'noopener,noreferrer');
  throw new Error('Desktop opener host is unavailable');
}

module.exports = Object.freeze({ ALLOWED_EXTERNAL_URL_PROTOCOLS, readExternalUrl, isElectronRenderer, isFileUrl, fileUrlToLocalPath, openExternalUrl, openDesktopLocalFile, revealDesktopLocalFile, openLocalFile });
