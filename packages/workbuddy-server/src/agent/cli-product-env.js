'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const { ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT, ProductEnviroment } = require('../../../authentication/src/common/authentication-protocol');

const AGENT_CLI_PRODUCT_CONFIG_ENV_KEYS = Object.freeze(['ACC_PRODUCT_CONFIG_V3', 'ACC_PRODUCT_CONFIG_V2']);
const AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY = 'ACC_PRODUCT_CONFIG_PATH';
const AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY = 'CODEBUDDY_INTERNET_ENVIRONMENT';

function resolveAgentCliProductEnv({ processEnv = process.env, productConfigEnv, productConfigPathEnv, fallbackProductConfigEnv, fallbackProductConfigPathEnv } = {}) {
  const resolvedProductConfigPathEnv = productConfigPathEnv ?? processEnv.ACC_PRODUCT_CONFIG_PATH ?? fallbackProductConfigPathEnv;
  const resolvedProductConfigEnv = productConfigEnv ?? (resolvedProductConfigPathEnv ? undefined : processEnv.ACC_PRODUCT_CONFIG_V3) ?? (resolvedProductConfigPathEnv ? undefined : fallbackProductConfigEnv);
  const env = { ACC_PRODUCT_CONFIG_V3: resolvedProductConfigEnv, [AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY]: resolvedProductConfigPathEnv };
  applyAgentCliHostedProductEnvironment(env, processEnv);
  return { productConfigEnv: resolvedProductConfigEnv, productConfigPathEnv: resolvedProductConfigPathEnv, hostedCliInternetEnv: env[AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY] };
}
async function resolveAgentCliProductEnvAsync(options = {}) {
  const { processEnv = process.env, productConfigEnv, productConfigPathEnv, fallbackProductConfigEnv, fallbackProductConfigPathEnv } = options;
  const resolvedProductConfigPathEnv = productConfigPathEnv ?? processEnv.ACC_PRODUCT_CONFIG_PATH ?? fallbackProductConfigPathEnv;
  const resolvedProductConfigEnv = productConfigEnv ?? (resolvedProductConfigPathEnv ? undefined : processEnv.ACC_PRODUCT_CONFIG_V3) ?? (resolvedProductConfigPathEnv ? undefined : fallbackProductConfigEnv);
  const env = { ACC_PRODUCT_CONFIG_V3: resolvedProductConfigEnv, [AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY]: resolvedProductConfigPathEnv };
  await applyAgentCliHostedProductEnvironmentAsync(env, processEnv);
  return { productConfigEnv: resolvedProductConfigEnv, productConfigPathEnv: resolvedProductConfigPathEnv, hostedCliInternetEnv: env[AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY] };
}
function applyAgentCliHostedProductEnvironment(env, processEnv = process.env) { const network = resolveAgentCliHostedInternetEnvironment(env, processEnv); if (network) env[AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY] = network; else delete env[AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY]; return env; }
async function applyAgentCliHostedProductEnvironmentAsync(env, processEnv = process.env) { const network = await resolveAgentCliHostedInternetEnvironmentAsync(env, processEnv); if (network) env[AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY] = network; else delete env[AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY]; return env; }
function resolveAgentCliHostedInternetEnvironment(env, processEnv = process.env) {
  const mergedEnv = env ? { ...processEnv, ...env } : processEnv;
  for (const key of AGENT_CLI_PRODUCT_CONFIG_ENV_KEYS) { const value = readAgentCliProductConfigJsonByKey(key, mergedEnv); if (!value) continue; try { const network = JSON.parse(value)?.networkEnvironment; if (isAgentCliProductEnvironment(network)) return network; } catch {} }
  const current = processEnv[ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT];
  return isAgentCliProductEnvironment(current) ? current : undefined;
}
async function resolveAgentCliHostedInternetEnvironmentAsync(env, processEnv = process.env) {
  const mergedEnv = env ? { ...processEnv, ...env } : processEnv;
  for (const key of AGENT_CLI_PRODUCT_CONFIG_ENV_KEYS) { const value = await readAgentCliProductConfigJsonByKeyAsync(key, mergedEnv); if (!value) continue; try { const network = JSON.parse(value)?.networkEnvironment; if (isAgentCliProductEnvironment(network)) return network; } catch {} }
  const current = processEnv[ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT];
  return isAgentCliProductEnvironment(current) ? current : undefined;
}
function readAgentCliProductConfigJsonByKey(key, env = process.env) { const inline = env[key]; if (inline) return inline; if (key !== 'ACC_PRODUCT_CONFIG_V3' || !env[AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY]) return undefined; try { return fs.readFileSync(env[AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY], 'utf8'); } catch { return undefined; } }
async function readAgentCliProductConfigJsonByKeyAsync(key, env = process.env) { const inline = env[key]; if (inline) return inline; if (key !== 'ACC_PRODUCT_CONFIG_V3' || !env[AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY]) return undefined; try { return await fsp.readFile(env[AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY], 'utf8'); } catch { return undefined; } }
function isAgentCliProductEnvironment(value) { return typeof value === 'string' && Object.values(ProductEnviroment).includes(value); }

module.exports = Object.freeze({ AGENT_CLI_HOSTED_INTERNET_ENVIRONMENT_KEY, AGENT_CLI_PRODUCT_CONFIG_ENV_KEYS, AGENT_CLI_PRODUCT_CONFIG_PATH_ENV_KEY, applyAgentCliHostedProductEnvironment, applyAgentCliHostedProductEnvironmentAsync, isAgentCliProductEnvironment, readAgentCliProductConfigJsonByKey, readAgentCliProductConfigJsonByKeyAsync, resolveAgentCliHostedInternetEnvironment, resolveAgentCliHostedInternetEnvironmentAsync, resolveAgentCliProductEnv, resolveAgentCliProductEnvAsync });
