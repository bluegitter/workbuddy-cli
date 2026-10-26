'use strict';

const IntentRecognitionServiceToken = Symbol('IntentRecognitionService');
const PLUGIN_STATUS = Object.freeze({ Enabled: 'enabled', Disabled: 'disabled', NotInstalled: 'not-installed' });
const CONNECTOR_RECALL_STATUS = Object.freeze({ EverConnected: 'ever-connected', NeverConnected: 'never-connected' });
const SKILL_STATUS = Object.freeze({ Enabled: 'enabled', Disabled: 'disabled' });

module.exports = Object.freeze({ IntentRecognitionServiceToken, PLUGIN_STATUS, CONNECTOR_RECALL_STATUS, SKILL_STATUS });
