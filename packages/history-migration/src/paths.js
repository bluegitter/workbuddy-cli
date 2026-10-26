'use strict';
const os = require('node:os');
const path = require('node:path');
function legacyAppDataDir() { if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support'); if (process.platform === 'win32') return process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming'); return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config'); }
function workbuddyConfigDir() { return process.env.WORKBUDDY_CONFIG_DIR?.trim() || process.env.CODEBUDDY_CONFIG_DIR?.trim() || path.join(os.homedir(), '.workbuddy'); }
module.exports = { legacyAppDataDir, workbuddyConfigDir };
