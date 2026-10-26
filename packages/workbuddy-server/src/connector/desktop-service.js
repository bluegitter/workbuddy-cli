'use strict';
const { ConnectorCloudService } = require('./cloud-service');
class ConnectorDesktopService extends ConnectorCloudService {
  constructor(deps) { super(deps); this.resolve = deps.resolveOauthName || ((name) => name); }
  authStart(name) { return super.authStart(this.resolve(name)); }
  authStatus(name) { return super.authStatus(this.resolve(name)); }
  authRevoke(name, params) { return super.authRevoke(this.resolve(name), params); }
  setUserConnectorActiveStatus(name, active) { return super.setUserConnectorActiveStatus(this.resolve(name), active); }
}
module.exports = { ConnectorDesktopService };
