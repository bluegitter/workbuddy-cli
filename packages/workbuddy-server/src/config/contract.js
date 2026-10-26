'use strict';
const CONFIG_RPC_CHANNELS = Object.freeze({ GET: 'config:get', SET: 'config:set', GET_ALL: 'config:getAll', GET_PRODUCT_SCENES: 'config:getProductScenes', GET_PRODUCT_CONFIGURATION: 'config:getProductConfiguration', PRODUCT_CONFIGURATION_CHANGED: 'config:productConfigurationChanged', GET_CLIENT_MENUS: 'config:getClientMenus', GET_LOCAL_CUSTOM_MODELS: 'config:getLocalCustomModels', SAVE_LOCAL_CUSTOM_MODEL: 'config:saveLocalCustomModel', DELETE_LOCAL_CUSTOM_MODEL: 'config:deleteLocalCustomModel' });
module.exports = { CONFIG_RPC_CHANNELS };
