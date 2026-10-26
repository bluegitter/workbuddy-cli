'use strict';

const WORKING_FAMILY_STATUSES = Object.freeze(['working', 'planning', 'running', 'connecting']);
const WORKING_QUERY_STATUSES = Object.freeze(['working', 'planning']);
function isWorkingFamilyStatus(status) { return WORKING_FAMILY_STATUSES.includes(String(status ?? '').trim().toLowerCase()); }

module.exports = { WORKING_FAMILY_STATUSES, WORKING_QUERY_STATUSES, isWorkingFamilyStatus };
