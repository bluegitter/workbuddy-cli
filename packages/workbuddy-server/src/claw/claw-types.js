'use strict';

const CLAW_CHANNEL_TYPES = Object.freeze(['feishu', 'wecomaibot', 'qq', 'dingtalk', 'yuanbao', 'weixinClawBot', 'wecomIOA', 'wechatkf', 'slack', 'discord', 'wecomNew', 'custom', 'wechatmp', 'telegram']);
function isClawChannelType(value) { return CLAW_CHANNEL_TYPES.includes(value); }

module.exports = Object.freeze({ CLAW_CHANNEL_TYPES, isClawChannelType });
