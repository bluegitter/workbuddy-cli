'use strict';
const { Edition } = require('./authentication-protocol');
function isPersonalAccount(account) { return account?.type?.trim().toLowerCase() === Edition.Personal; }
module.exports = { isPersonalAccount };
