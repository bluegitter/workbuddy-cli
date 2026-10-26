'use strict';

const os = require('os');
const path = require('path');

function getWorkbuddyConfigDir(env = process.env, homeDir = os.homedir()) {
  const explicit = env.WORKBUDDY_CONFIG_DIR?.trim();
  if (explicit) return explicit;
  const dataFolderName = env.WORKBUDDY_DATA_FOLDER_NAME?.trim() || '.workbuddy';
  return path.join(homeDir, dataFolderName);
}

module.exports = { getWorkbuddyConfigDir };
