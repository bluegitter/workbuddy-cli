'use strict';

function createAppServerDesktopHostBridge({ parent, events, appName, appVersion, appLocale, appConfigDir, isPackaged, noopDesktopHost, channels }) {
  return {
    ...noopDesktopHost,
    app: { ...noopDesktopHost.app, getName: () => appName || noopDesktopHost.app.getName(), getVersion: () => appVersion || noopDesktopHost.app.getVersion(), getLocale: () => appLocale || noopDesktopHost.app.getLocale(), getConfigDir: () => appConfigDir || noopDesktopHost.app.getConfigDir(), isPackaged: () => isPackaged === true },
    dialog: createBridgeDialog(parent, channels),
    shell: {
      ...noopDesktopHost.shell,
      openExternal: async (url) => {
        const result = await parent.invoke(channels.OPEN_EXTERNAL, url);
        const opened = result !== false;
        console.log(`[DesktopHostBridge] openExternal RPC result=${String(result)} -> opened=${opened} for: ${url}`);
        return opened;
      },
      openPath: async (filePath) => { const result = await parent.invoke(channels.OPEN_PATH, filePath); return typeof result === 'string' ? result : ''; },
      showItemInFolder: async (filePath) => { await parent.invoke(channels.SHOW_ITEM_IN_FOLDER, filePath); },
    },
    network: {
      ...noopDesktopHost.network,
      fetch: async (url, init) => fetch(url, init),
      getDefaultSession: () => createBridgeSession(parent, 'default', channels),
      getSessionPartition: (partition) => createBridgeSession(parent, partitionToScope(partition), channels),
      clearDefaultSessionCookiesForDomains: async (domains) => { const result = await parent.invoke(channels.CLEAR_DEFAULT_SESSION_COOKIES_FOR_DOMAINS, { domains }); return typeof result === 'number' ? result : 0; },
      resolveProxy: async (targetUrl) => { const result = await parent.invoke(channels.RESOLVE_PROXY, { targetUrl }); return typeof result === 'string' ? result : 'DIRECT'; },
      applyProxySettings: async (settings) => {
        const result = await parent.invoke(channels.APPLY_PROXY_SETTINGS, { settings });
        return result && typeof result === 'object' && 'HTTP_PROXY' in result && 'HTTPS_PROXY' in result && 'NO_PROXY' in result ? result : { HTTP_PROXY: '', HTTPS_PROXY: '', NO_PROXY: '' };
      },
    },
    auth: { ...noopDesktopHost.auth, decryptLegacyAuthSession: async (encryptedBase64) => { const result = await parent.invoke(channels.DECRYPT_LEGACY_AUTH_SESSION, { encryptedBase64 }); return typeof result === 'string' ? result : undefined; } },
    window: { ...noopDesktopHost.window, send(channel, data) { events.push(channel, data); return true; } },
    showTaskCompletedNotification(payload) { events.push(channels.TASK_COMPLETED_NOTIFICATION, payload); return true; },
  };
}

function createBridgeSession(parent, scope, channels) {
  return { cookies: {
    async set(details) { await parent.invoke(channels.COOKIE_SET, { scope, details }); },
    async get(filter) { const result = await parent.invoke(channels.COOKIE_GET, { scope, filter }); return Array.isArray(result) ? result : []; },
    async remove(url, name) { await parent.invoke(channels.COOKIE_REMOVE, { scope, url, name }); },
  } };
}

function partitionToScope(partition) {
  if (partition === 'persist:tdoc-import') return 'tdoc-import';
  if (partition === 'persist:tdoc-preview') return 'tdoc-preview';
  throw new Error(`Unsupported app-server desktop host partition: ${partition}`);
}

function createBridgeDialog(parent, channels) {
  return {
    async showOpenDialog(options) { return readOpenDialogResult(await parent.invoke(channels.SHOW_OPEN_DIALOG, { title: options.title, defaultPath: options.defaultPath, filters: options.filters, properties: options.properties })); },
    async showSaveDialog(options) { return readSaveDialogResult(await parent.invoke(channels.SHOW_SAVE_DIALOG, { title: options.title, defaultPath: options.defaultPath, filters: options.filters })); },
    async showMessageBox(options) { return readMessageBoxResult(await parent.invoke(channels.SHOW_MESSAGE_BOX, { type: options.type, title: options.title, message: options.message, detail: options.detail, buttons: options.buttons, defaultId: options.defaultId, cancelId: options.cancelId, noLink: options.noLink })); },
  };
}

function readOpenDialogResult(value) {
  if (!value || typeof value !== 'object') return { canceled: true, filePaths: [] };
  const filePaths = Array.isArray(value.filePaths) ? value.filePaths.filter((item) => typeof item === 'string') : [];
  return { canceled: value.canceled !== false && filePaths.length === 0, filePaths };
}
function readSaveDialogResult(value) {
  if (!value || typeof value !== 'object') throw new Error('desktopHost.showSaveDialog returned an invalid result');
  if (value.canceled === true) return { canceled: true };
  const filePath = typeof value.filePath === 'string' && value.filePath.trim() ? value.filePath : undefined;
  if (!filePath) throw new Error('desktopHost.showSaveDialog returned an invalid result');
  return { canceled: false, filePath };
}
function readMessageBoxResult(value) { return !value || typeof value !== 'object' ? { response: 0 } : { response: typeof value.response === 'number' ? value.response : 0 }; }

module.exports = { createAppServerDesktopHostBridge, partitionToScope, readMessageBoxResult, readOpenDialogResult, readSaveDialogResult };
