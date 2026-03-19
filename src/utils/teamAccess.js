/**
 * Team Access Utility
 * Helper functions for team-based job assignment and access control
 */

/**
 * Get the current user's crew_member_id via RPC
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string|null>} Crew member ID or null if not found
 */
export async function getCurrentCrewMemberId(supabase) {
  try {
    const { data, error } = await supabase.rpc('current_crew_member_id');
    if (error) {
      console.error('Error getting crew member ID:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Error getting crew member ID:', err);
    return null;
  }
}

/**
 * Check if the current user is a member of the specified team
 * @param {Object} supabase - Supabase client instance
 * @param {string} teamId - Team ID to check membership for
 * @returns {Promise<boolean>} True if user is on the team, false otherwise
 */
export async function userIsOnTeam(supabase, teamId) {
  if (!teamId) return false;
  
  try {
    const crewMemberId = await getCurrentCrewMemberId(supabase);
    if (!crewMemberId) return false;
    
    // Check if crew_member is in team_members for this team
    const { data, error } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('team_id', teamId)
      .eq('crew_member_id', crewMemberId);
    
    if (error) return false;
    
    // Check if any row exists (user is a member)
    return data && data.length > 0;
  } catch (err) {
    console.error('Error checking team membership:', err);
    return false;
  }
}

/**
 * Get all team IDs that the current user belongs to
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string[]>} Array of team IDs
 */
export async function getUserTeamIds(supabase) {
  try {
    const crewMemberId = await getCurrentCrewMemberId(supabase);
    if (!crewMemberId) return [];
    
    // Get all teams this crew member belongs to
    const { data, error } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('crew_member_id', crewMemberId);
    
    if (error) {
      console.error('Error fetching user teams:', error);
      return [];
    }
    
    return (data || []).map(tm => tm.team_id).filter(Boolean);
  } catch (err) {
    console.error('Error getting user team IDs:', err);
    return [];
  }
}

/**
 * Check if user can access a job (must be on the job's assigned team)
 * @param {Object} supabase - Supabase client instance
 * @param {Object} job - Job object with assigned_team_id
 * @returns {Promise<boolean>} True if user can access the job
 */
export async function userCanAccessJob(supabase, job) {
  if (!job) return false;
  
  // If job has no team assigned, no one can access it (unassigned)
  if (!job.assigned_team_id) return false;
  
  // Get user's team IDs and check if job's team is in the list
  const userTeamIds = await getUserTeamIds(supabase);
  return userTeamIds.includes(job.assigned_team_id);
}
