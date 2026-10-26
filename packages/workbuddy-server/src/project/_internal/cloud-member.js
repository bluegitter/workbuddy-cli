'use strict';
const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');
function roleToRoleId(role) { return role === 'admin' ? 'project.owner' : role === 'editor' ? 'project.admin' : 'project.member'; }
function roleIdToRole(roleId, fallbackRole) { return roleId === 'project.owner' ? 'admin' : roleId === 'project.admin' ? 'editor' : roleId === 'project.member' ? 'viewer' : fallbackRole ?? 'viewer'; }
async function listProjectMembers(http, projectId, options) { const result = unwrap(await http.get(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/members${options?.includeRevoked ? '?includeRevoked=true' : ''}`), 'list project members'); result.items = result.items.map((member) => ({ ...member, role: member.roleId ? roleIdToRole(member.roleId, member.role) : member.role })); return result; }
async function updateProjectMemberRole(http, projectId, userId, patch) { return unwrap(await http.patch(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { roleId: roleToRoleId(patch.role) }), 'update project member role'); }
async function removeProjectMember(http, projectId, userId) { return unwrap(await http.delete(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`), 'remove project member'); }
module.exports = Object.freeze({ roleToRoleId, roleIdToRole, listProjectMembers, updateProjectMemberRole, removeProjectMember });
