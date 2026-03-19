// Canonical job assignment helper.
// Primary assignment is assigned_team_id only.
// Legacy fields (assigned_to, assigned_crew_member_id, assigned_user_id) have been removed.

export function getJobAssignedTeamId(job) {
  if (!job) return null;
  return job.assigned_team_id || null;
}

export function hasLegacyAssignment(job) {
  // Legacy fields removed - always returns false
  return false;
}

export function isJobUnassigned(job) {
  if (!job) return true;
  const hasTeam = !!job.assigned_team_id;
  return !hasTeam;
}

export function hasAnyAssignment(job) {
  if (!job) return false;
  return !!job.assigned_team_id;
}
