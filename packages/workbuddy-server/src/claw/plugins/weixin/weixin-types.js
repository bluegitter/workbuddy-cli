'use strict';
const WeixinMessageItemType = Object.freeze({ TEXT: 1, IMAGE: 2, VOICE: 3, FILE: 4, VIDEO: 5 });
const DEFAULT_API_BASE_URL = 'https://ilinkai.weixin.qq.com';
const DEFAULT_POLL_TIMEOUT_MS = 35000;
const QR_LONG_POLL_TIMEOUT_MS = 35000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 60000;
module.exports = Object.freeze({ WeixinMessageItemType, DEFAULT_API_BASE_URL, DEFAULT_POLL_TIMEOUT_MS, QR_LONG_POLL_TIMEOUT_MS, DEFAULT_MAX_RECONNECT_DELAY_MS });
