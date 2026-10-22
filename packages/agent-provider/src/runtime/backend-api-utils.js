'use strict';

const DEFAULT_PROJECT_INVITATION_ROLE = 'viewer';
const DEFAULT_PROJECT_INVITATION_STATUS = 'pending';

function normalizeProjectInvitationRole(role) {
  return role === 'admin' || role === 'editor' || role === 'viewer' ? role : DEFAULT_PROJECT_INVITATION_ROLE;
}

function normalizeProjectInvitationStatus(status) {
  return typeof status === 'string' && status.trim() ? status : DEFAULT_PROJECT_INVITATION_STATUS;
}

function normalizeOptionalProjectInvitationStatus(status) {
  return typeof status === 'string' && status.trim() ? normalizeProjectInvitationStatus(status) : undefined;
}

function getBackendErrorPayload(error) {
  return {
    error: error?.response?.data?.msg || error?.response?.data?.message || error?.message || 'Request failed',
    statusCode: error?.response?.status,
    errorCode: error?.response?.data?.code ? String(error.response.data.code) : undefined,
  };
}

function normalizeProjectInvitationDetail(data) {
  const project = data?.project || {};
  const inviter = data?.inviter || {};
  return {
    inviteId: data?.inviteId || data?.invite_id || '',
    project: {
      projectId: project?.projectId || project?.project_id || '',
      name: project?.name || '',
      memberCount: Number(project?.memberCount ?? project?.member_count ?? 0),
      description: project?.description,
    },
    role: normalizeProjectInvitationRole(data?.role),
    inviter: {
      userId: inviter?.userId || inviter?.user_id || '',
      name: inviter?.name || inviter?.nickname || inviter?.userName || '',
      email: inviter?.email,
      avatar: inviter?.avatar || inviter?.avatarUrl || inviter?.avatar_url,
    },
    status: normalizeProjectInvitationStatus(data?.status),
    expiresAt: data?.expiresAt || data?.expires_at,
  };
}

function normalizeAcceptProjectInvitationResult(data) {
  return {
    result: typeof data?.result === 'string' ? data.result : typeof data?.joinStatus === 'string' ? data.joinStatus : typeof data?.outcome === 'string' ? data.outcome : undefined,
    projectId: data?.projectId || data?.project_id || '',
    role: normalizeProjectInvitationRole(data?.role),
    memberCount: data?.memberCount ?? data?.member_count,
    status: normalizeOptionalProjectInvitationStatus(data?.status ?? data?.nextState),
  };
}

module.exports = {
  DEFAULT_PROJECT_INVITATION_ROLE,
  DEFAULT_PROJECT_INVITATION_STATUS,
  normalizeProjectInvitationRole,
  normalizeProjectInvitationStatus,
  normalizeOptionalProjectInvitationStatus,
  getBackendErrorPayload,
  normalizeProjectInvitationDetail,
  normalizeAcceptProjectInvitationResult,
};
