'use strict';

function normalizeFileTreePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.length <= 1 ? normalized : normalized.replace(/\/+$/g, '');
}

function getParentPath(filePath) {
  const normalized = normalizeFileTreePath(filePath);
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '' : normalized.slice(0, index);
}

function isPathInWorkspace(filePath, workspacePath) {
  const path = normalizeFileTreePath(filePath);
  const workspace = normalizeFileTreePath(workspacePath);
  if (path === workspace) return true;
  return path.startsWith(workspace.endsWith('/') ? workspace : `${workspace}/`);
}

function findTreeNodeByPath(nodes, filePath) {
  const target = normalizeFileTreePath(filePath);
  for (const node of nodes) {
    if (normalizeFileTreePath(node.path) === target) return node;
    if (node.children) {
      const found = findTreeNodeByPath(node.children, target);
      if (found) return found;
    }
  }
  return undefined;
}

function findNearestExistingDir(nodes, dirPath, workspacePath) {
  const workspace = normalizeFileTreePath(workspacePath);
  let current = normalizeFileTreePath(dirPath);
  while (current && isPathInWorkspace(current, workspace)) {
    if (current === workspace) return workspace;
    const node = findTreeNodeByPath(nodes, current);
    if (node?.type === 'dir') return normalizeFileTreePath(node.path);
    current = getParentPath(current);
  }
  return undefined;
}

function isDirectoryHiddenByCollapsedState(dirPath, collapsedFolders, workspacePath) {
  const workspace = normalizeFileTreePath(workspacePath);
  let current = normalizeFileTreePath(dirPath);
  while (current && current !== workspace && isPathInWorkspace(current, workspace)) {
    if (collapsedFolders.has(current)) return true;
    current = getParentPath(current);
  }
  return false;
}

function resolveFileTreeRefreshTarget({ eventPath, workspacePath, treeData }) {
  const normalizedEventPath = normalizeFileTreePath(eventPath);
  const workspace = normalizeFileTreePath(workspacePath);
  const eventDir = getParentPath(normalizedEventPath) || workspace;
  const exact = eventDir === workspace ? undefined : findTreeNodeByPath(treeData, eventDir);
  if (eventDir === workspace || exact?.type === 'dir') return { eventPath: normalizedEventPath, eventDir, refreshDir: eventDir, foundExactDir: true };
  return { eventPath: normalizedEventPath, eventDir, refreshDir: findNearestExistingDir(treeData, eventDir, workspace) ?? workspace, foundExactDir: false };
}

function removeTreeNodeByPath(nodes, targetPath) {
  const target = normalizeFileTreePath(targetPath);
  const prefix = `${target}/`;
  let changed = false;
  const next = nodes.reduce((result, node) => {
    const nodePath = normalizeFileTreePath(node.path);
    if (nodePath === target || nodePath.startsWith(prefix)) { changed = true; return result; }
    if (node.children) {
      const children = removeTreeNodeByPath(node.children, target);
      if (children !== node.children) { changed = true; result.push({ ...node, children }); return result; }
    }
    result.push(node);
    return result;
  }, []);
  return changed ? next : nodes;
}

function invalidateDirectoryNode(nodes, dirPath) {
  const target = normalizeFileTreePath(dirPath);
  let changed = false;
  const next = nodes.map((node) => {
    if (normalizeFileTreePath(node.path) === target && node.type === 'dir') { changed = true; return { ...node, children: undefined, isLoaded: false }; }
    if (node.children) {
      const children = invalidateDirectoryNode(node.children, target);
      if (children !== node.children) { changed = true; return { ...node, children }; }
    }
    return node;
  });
  return changed ? next : nodes;
}

function removePathSubtreeFromSet(paths, targetPath) {
  const target = normalizeFileTreePath(targetPath);
  const prefix = `${target}/`;
  let changed = false;
  const next = new Set();
  for (const value of paths) {
    const normalized = normalizeFileTreePath(value);
    if (normalized === target || normalized.startsWith(prefix)) { changed = true; continue; }
    next.add(value);
  }
  return changed ? next : paths;
}

function collectUnloadedFolderPathsFromNodes(nodes, result = []) {
  for (const node of nodes) if (node.type === 'dir') {
    if (node.isLoaded !== true) result.push(node.path);
    if (node.children) collectUnloadedFolderPathsFromNodes(node.children, result);
  }
  return result;
}

module.exports = Object.freeze({ normalizeFileTreePath, getParentPath, isPathInWorkspace, findTreeNodeByPath, findNearestExistingDir, isDirectoryHiddenByCollapsedState, resolveFileTreeRefreshTarget, removeTreeNodeByPath, invalidateDirectoryNode, removePathSubtreeFromSet, collectUnloadedFolderPathsFromNodes });
