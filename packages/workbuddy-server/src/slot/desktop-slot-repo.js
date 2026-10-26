'use strict';
const { CloudSlotRepo } = require('./cloud-slot-repo');
class DesktopSlotRepo extends CloudSlotRepo { constructor(deps) { super({ ...deps, routePrefix: '/v2' }); } }
module.exports = { DesktopSlotRepo };
