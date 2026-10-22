'use strict';

class DefaultWorkspace {
  constructor(workspaceFolders = []) {
    this.workspaceFolders = Array.isArray(workspaceFolders) ? [...workspaceFolders] : [];
  }
}

module.exports = { DefaultWorkspace, DefaultWorkspaceImpl: DefaultWorkspace };
