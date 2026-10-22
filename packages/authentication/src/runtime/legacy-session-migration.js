'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const LEGACY_WORKBUDDY_IDE_AUTH_SECRET_KEY = 'secret://{"extensionId":"tencent-cloud.coding-copilot","key":"planning-genie.new.accessTokencn"}';

function getLegacyWorkbuddyIdeVscdbPath(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.homedir || os.homedir();
  let appDataPath;
  if (platform === 'darwin') appDataPath = path.join(home, 'Library', 'Application Support');
  else if (platform === 'win32') appDataPath = env.APPDATA?.trim() || path.join(home, 'AppData', 'Roaming');
  else if (platform === 'linux') appDataPath = env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config');
  else return undefined;
  return path.join(appDataPath, 'WorkBuddy', 'User', 'globalStorage', 'state.vscdb');
}

function parseLegacyWorkbuddyIdeAuthSession(decrypted) {
  let session;
  try { session = JSON.parse(decrypted); } catch { return undefined; }
  return session?.auth && session?.account ? session : undefined;
}

function createLegacyAuthSessionMigrator(deps = {}, logger) {
  const readEncrypted = deps.readEncrypted || (() => undefined);
  const resolvePath = deps.resolvePath || (() => getLegacyWorkbuddyIdeVscdbPath(deps));
  return { async migrate() {
    const dbPath = resolvePath();
    if (!dbPath || !fs.existsSync(dbPath)) return undefined;
    logger?.info?.(`Found old IDE database at: ${dbPath}`);
    let encrypted;
    try { encrypted = await readEncrypted(dbPath, LEGACY_WORKBUDDY_IDE_AUTH_SECRET_KEY); }
    catch (error) { logger?.warn?.(`Failed to query old IDE database: ${error}`); return undefined; }
    if (!encrypted) { logger?.info?.('No auth session found in old IDE database'); return undefined; }
    try {
      const decrypted = await deps.decryptString(encrypted);
      if (!decrypted) { logger?.warn?.('Legacy IDE session decryptor returned no data'); return undefined; }
      return parseLegacyWorkbuddyIdeAuthSession(decrypted);
    } catch (error) { logger?.warn?.(`Failed to decrypt old IDE auth session: ${error}`); return undefined; }
  } };
}

module.exports = Object.freeze({
  LEGACY_WORKBUDDY_IDE_AUTH_SECRET_KEY,
  createLegacyAuthSessionMigrator,
  getLegacyWorkbuddyIdeVscdbPath,
  parseLegacyWorkbuddyIdeAuthSession,
});
