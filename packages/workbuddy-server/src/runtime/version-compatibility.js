'use strict';

function parseVersion(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.trim().replace(/^v/, '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ? match[4].split('.') : [] };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left;
  const b = typeof right === 'string' ? parseVersion(right) : right;
  if (!a || !b) return undefined;
  for (const key of ['major', 'minor', 'patch']) if (a[key] !== b[key]) return a[key] - b[key];
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const result = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (result) return result;
  }
  return 0;
}

function checkCompatibility({ currentVersion, minWorkbuddyVersion, maxWorkbuddyVersion } = {}) {
  const current = parseVersion(currentVersion);
  if (!current) return null;
  const min = parseVersion(minWorkbuddyVersion);
  if (min && compareVersions(current, min) < 0) return { kind: 'needsUpgrade', requiredMinVersion: `${min.major}.${min.minor}.${min.patch}${min.prerelease.length ? `-${min.prerelease.join('.')}` : ''}` };
  const max = parseVersion(maxWorkbuddyVersion);
  if (max && compareVersions(current, max) > 0) return { kind: 'connectorRetired' };
  return null;
}

module.exports = { checkCompatibility, compareVersions, parseVersion };
