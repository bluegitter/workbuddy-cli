'use strict';

const { ROUTE_PREFIX, unwrap } = require('../../runtime/http-contract');
const {
  ExclusivePlanNotSupportedError,
  MemberQuotaExceededError,
  isExclusivePlanError,
  tryParseMemberQuotaError,
} = require('./quota-errors');

const INVITATION_ROUTE_PREFIX = '/console/as/invitations/project';

function normalizeRole(role) {
  return role === 'admin' || role === 'editor' || role === 'viewer' ? role : 'viewer';
}

function normalizeStatus(status) {
  return typeof status === 'string' && status.trim() ? status : 'pending';
}

function normalizeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

function normalizeString(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeProjectInfo(data) {
  const project = data?.project || {};
  return {
    projectId: project.projectId || project.project_id || data?.projectId || data?.project_id || '',
    name: project.name || data?.projectName || '',
    memberCount: normalizeNumber(project.memberCount ?? project.member_count ?? data?.memberCount ?? data?.member_count) ?? 0,
    description: project.description || project.instructions || data?.projectDescription,
    ownerUid: normalizeString(project.ownerUid ?? project.owner_uid),
    ownerName: normalizeString(project.ownerName ?? project.owner_name),
    ownerPlan: normalizeString(project.ownerPlan ?? project.owner_plan),
    memberCapacityMax: normalizeNumber(project.memberCapacityMax ?? project.member_capacity_max),
  };
}

function normalizeInvitation(data) {
  return {
    inviteId: data?.inviteId || data?.invite_id || '',
    project: normalizeProjectInfo(data),
    role: normalizeRole(data?.role),
    inviter: {
      userId: data?.inviter?.userId || data?.inviter?.user_id || '',
      name: data?.inviter?.name || data?.inviter?.nickname || data?.inviter?.displayName || '',
      email: data?.inviter?.email,
      avatar: data?.inviter?.avatar || data?.inviter?.avatarUrl || data?.inviter?.avatar_url,
    },
    status: normalizeStatus(data?.status),
    expiresAt: data?.expiresAt || data?.expires_at,
  };
}

function normalizeRequestError(error, operation) {
  if (error instanceof MemberQuotaExceededError || error instanceof ExclusivePlanNotSupportedError) return error;
  const normalized = new Error(error?.message || operation);
  normalized.name = 'ProjectInvitationRequestError';
  normalized.code = error?.code;
  normalized.data = error?.data;
  normalized.cause = error;
  return normalized;
}

function throwQuotaError(error, currentUid) {
  const data = tryParseMemberQuotaError(error, currentUid);
  if (data) throw new MemberQuotaExceededError(data);
  if (isExclusivePlanError(error)) throw new ExclusivePlanNotSupportedError();
}

async function createProjectInvitation(projectId, request, http, currentUid) {
  try {
    const data = unwrap(await http.post(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/invitations`, request), 'create project invitation');
    return {
      inviteId: data?.inviteId || data?.invite_id || '',
      status: normalizeStatus(data?.status),
      acceptUrl: data?.acceptUrl || data?.accept_url || '',
      expiresAt: data?.expiresAt || data?.expires_at,
    };
  } catch (error) {
    throwQuotaError(error, currentUid);
    throw normalizeRequestError(error, 'Create project invitation failed');
  }
}

async function getProjectInvitationDetail(token, http) {
  try {
    return normalizeInvitation(unwrap(await http.get(`${INVITATION_ROUTE_PREFIX}/${encodeURIComponent(token)}`), 'get project invitation detail'));
  } catch (error) {
    if (isExclusivePlanError(error)) throw new ExclusivePlanNotSupportedError();
    throw normalizeRequestError(error, 'Get project invitation detail failed');
  }
}

async function acceptProjectInvitation(token, http, currentUid) {
  try {
    const data = unwrap(await http.post(`${INVITATION_ROUTE_PREFIX}/${encodeURIComponent(token)}/accept`, {}), 'accept project invitation');
    return {
      result: typeof data?.result === 'string' ? data.result : data?.joinStatus || data?.outcome,
      projectId: data?.projectId || data?.project_id || '',
      role: normalizeRole(data?.role),
      memberCount: data?.memberCount ?? data?.member_count,
      status: typeof (data?.status ?? data?.nextState) === 'string' ? (data.status ?? data.nextState) : undefined,
    };
  } catch (error) {
    throwQuotaError(error, currentUid);
    throw normalizeRequestError(error, 'Accept project invitation failed');
  }
}

async function rejectProjectInvitation(token, http) {
  try {
    unwrap(await http.post(`${INVITATION_ROUTE_PREFIX}/${encodeURIComponent(token)}/reject`, {}), 'reject project invitation');
  } catch (error) {
    throw normalizeRequestError(error, 'Reject project invitation failed');
  }
}

async function approveProjectInvitation(projectId, inviteId, http, currentUid) {
  try {
    unwrap(await http.post(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/invitations/${encodeURIComponent(inviteId)}/approve`, {}), 'approve project invitation');
  } catch (error) {
    throwQuotaError(error, currentUid);
    throw error;
  }
}

async function adminRejectProjectInvitation(projectId, inviteId, http) {
  try {
    unwrap(await http.post(`${ROUTE_PREFIX}/${encodeURIComponent(projectId)}/invitations/${encodeURIComponent(inviteId)}/admin-reject`, {}), 'admin reject project invitation');
  } catch (error) {
    if (isExclusivePlanError(error)) throw new ExclusivePlanNotSupportedError();
    throw error;
  }
}

module.exports = {
  createProjectInvitation,
  getProjectInvitationDetail,
  acceptProjectInvitation,
  rejectProjectInvitation,
  approveProjectInvitation,
  adminRejectProjectInvitation,
};
