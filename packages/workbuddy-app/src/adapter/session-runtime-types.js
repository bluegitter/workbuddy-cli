'use strict';

const SESSION_WELCOME_MODES = Object.freeze(['coding', 'working', 'design']);
function isSessionWelcomeMode(value) { return typeof value === 'string' && SESSION_WELCOME_MODES.includes(value); }

module.exports = Object.freeze({ SESSION_WELCOME_MODES, isSessionWelcomeMode });
