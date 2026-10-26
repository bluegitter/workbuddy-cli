'use strict';
const runtime = require('../runtime/app-server-runtime');
const context = require('../../../runtime/src/runtime/startup-context');
function assertWorkbuddyAppServerStdioMode(argv) { return runtime.assertWorkbuddyAppServerStdioMode(argv); }
function configureWorkbuddyAppServerRuntimeContextFromEnv(platform) { return context.configureWorkbuddyRuntimeContext({ appPath: platform.appRootPath, configDir: platform.configDir, locale: process.env.WORKBUDDY_LOCALE?.trim() || undefined, promptTemplatesDir: process.env.WORKBUDDY_PROMPT_TEMPLATES_DIR?.trim() || undefined, userDataDir: platform.dataDir }); }
function createWorkbuddyAppServerPlatformFromEnv(options = {}) { return runtime.createWorkbuddyAppServerPlatformFromEnv({ ...options, runtime: { appRootPath: context.getWorkbuddyRuntimeAppPath(), dataDir: context.getWorkbuddyRuntimeUserDataDir(), configDir: context.getWorkbuddyRuntimeConfigDir(), appVersion: context.getWorkbuddyRuntimeAppVersion(), locale: context.getWorkbuddyRuntimeLocale() } }); }
function createNoopWorkbuddyAppServerWindowManager() { return runtime.createNoopWorkbuddyAppServerWindowManager(); }
function readBooleanEnv(key) { return runtime.readBooleanEnv(process.env[key]); }
module.exports = Object.freeze({ assertWorkbuddyAppServerStdioMode, configureWorkbuddyAppServerRuntimeContextFromEnv, createWorkbuddyAppServerPlatformFromEnv, createNoopWorkbuddyAppServerWindowManager, readBooleanEnv });
