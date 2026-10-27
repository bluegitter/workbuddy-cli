'use strict';

const path = require('path');

function resolveAppConfig(root, env = process.env) {
  return Object.freeze({
    root: path.resolve(root),
    userData: env.WORKBUDDY_USER_DATA_DIR || path.resolve(root, 'wb-data/userdata'),
    config: env.WORKBUDDY_CONFIG_DIR || path.resolve(root, 'wb-data/config'),
    cli: path.resolve(root, 'runtime-app/cli/bin/codebuddy'),
  });
}

module.exports = { resolveAppConfig };
