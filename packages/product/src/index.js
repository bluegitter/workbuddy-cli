'use strict';
module.exports = Object.freeze({ packageName: '@workbuddy/product', ...require('./runtime/product-endpoint'), ...require('./cloud-assistant-service'), ...require('./credit-prediction'), ...require('./growth') });
