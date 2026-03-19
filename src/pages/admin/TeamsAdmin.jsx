import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import useCompanySettings from '../../hooks/useCompanySettings';
import useConfirm from '../../hooks/useConfirm';
import { Users, Edit2, Trash2, X, Check } from 'lucide-react';

export default function TeamsAdmin() {
  const { settings } = useCompanySettings();
  const { confirm, ConfirmDialog } = useConfirm();
  const crewLabel = settings?.crew_label || "Crew";
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [addingWorkers, setAddingWorkers] = useState({}); // { teamId: true/false }
  const [updatingRoles, setUpdatingRoles] = useState({}); // { teamMemberId: true/false }
  const [removingMembers, setRemovingMembers] = useState({}); // { teamMemberId: true/false }
  const [deletingCrews, setDeletingCrews] = useState({}); // { teamId: true/false }
  const [renamingCrews, setRenamingCrews] = useState({}); // { teamId: true/false }
  const [editingCrewName, setEditingCrewName] = useState({}); // { teamId: newName }
  const [jobCounts, setJobCounts] = useState({}); // { teamId: count }
  const [selectedWorkers, setSelectedWorkers] = useState({}); // { teamId: workerId }

  // Get current user's company_id
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();
      setCompanyId(profile?.company_id || null);
    };
    init();
  }, []);

  // Fetch teams, team members, and workers
  useEffect(() => {
    if (!companyId) return;
    fetchTeams();
    fetchWorkers();
  }, [companyId]);

  const fetchWorkers = async () => {
    try {
      const { data, error } = await supabase
        .from('crew_members')
        .select('id, full_name, role, user_id')
        .eq('company_id', companyId)
        .order('full_name');

      if (error) {
        console.error('Error fetching workers:', error);
        toast.error('Failed to load workers');
      } else {
        setWorkers(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching workers:', err);
      toast.error('Failed to load workers');
    }
  };

  const fetchTeams = async () => {
    setLoading(true);
    try {
      // Fetch teams (RLS will filter by company_id automatically)
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, created_at')
        .eq('company_id', companyId)
        .order('name');

      if (teamsError) {
        console.error('Error fetching teams:', teamsError);
        toast.error('Failed to load crews');
        setLoading(false);
        return;
      }

      setTeams(teamsData || []);

      // Fetch team members with nested crew_members data
      if (teamsData && teamsData.length > 0) {
        const teamIds = teamsData.map(t => t.id);
        const { data: teamMembersData, error: teamMembersError } = await supabase
          .from('team_members')
          .select('*, crew_members(id, full_name, role)')
          .in('team_id', teamIds);

        if (teamMembersError) {
          console.error('Error fetching team members:', teamMembersError);
          toast.error('Failed to load crew members');
        } else {
          setTeamMembers(teamMembersData || []);
        }

        // Fetch job counts for each crew
        const jobCountsMap = {};
        for (const teamId of teamIds) {
          const { count, error: countError } = await supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('assigned_team_id', teamId);
          
          if (!countError) {
            jobCountsMap[teamId] = count || 0;
          }
        }
        setJobCounts(jobCountsMap);
      } else {
        setTeamMembers([]);
        setJobCounts({});
      }
    } catch (err) {
      console.error('Unexpected error fetching teams:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim()) {
      toast.error('Crew name is required');
      return;
    }
    if (!companyId) {
      toast.error('Company ID not found');
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase
        .from('teams')
        .insert([{
          name: teamName.trim(),
          company_id: companyId
        }]);

      if (error) {
        // Check for unique constraint violation
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          toast.error('A crew with that name already exists');
        } else {
          console.error('Error creating crew:', error);
          toast.error('Failed to create crew');
        }
      } else {
        toast.success('Crew created');
        setTeamName('');
        // Refresh the teams list
        fetchTeams();
      }
    } catch (err) {
      console.error('Unexpected error creating crew:', err);
      toast.error('Failed to create crew');
    } finally {
      setCreating(false);
    }
  };

  const handleAddWorker = async (teamId) => {
    const workerId = selectedWorkers[teamId];
    if (!workerId) {
      toast.error('Please select a worker');
      return;
    }

    setAddingWorkers(prev => ({ ...prev, [teamId]: true }));
    try {
      // Find the worker to get their role
      const worker = workers.find(w => w.id === workerId);
      const defaultRole = worker?.role === 'lead' ? 'lead' : 'member';

      // Step 1: Remove worker from any other team in this company
      // Get all team IDs for this company
      const companyTeamIds = teams.map(t => t.id);
      if (companyTeamIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('team_members')
          .delete()
          .eq('crew_member_id', workerId)
          .in('team_id', companyTeamIds);

        if (deleteError) {
          console.error('Error removing worker from other teams:', deleteError);
          // Continue anyway - might not be in any team
        }
      }

      // Step 2: Add worker to this team
      const { error: insertError } = await supabase
        .from('team_members')
        .insert([{
          team_id: teamId,
          crew_member_id: workerId,
          role: defaultRole
        }]);

      if (insertError) {
        // Check for duplicate constraint
        if (insertError.code === '23505' || insertError.message?.includes('unique') || insertError.message?.includes('duplicate')) {
          toast.error('Worker already in team');
        } else {
          console.error('Error adding worker to team:', insertError);
          toast.error('Failed to add worker');
          // Refetch to recover state
          fetchTeams();
        }
      } else {
        toast.success('Worker added');
        setSelectedWorkers(prev => ({ ...prev, [teamId]: '' }));
        fetchTeams();
      }
    } catch (err) {
      console.error('Unexpected error adding worker:', err);
      toast.error('Failed to add worker');
      fetchTeams(); // Refetch to recover
    } finally {
      setAddingWorkers(prev => ({ ...prev, [teamId]: false }));
    }
  };

  const handleUpdateRole = async (teamMemberId, newRole) => {
    setUpdatingRoles(prev => ({ ...prev, [teamMemberId]: true }));
    try {
      const { error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('id', teamMemberId);

      if (error) {
        console.error('Error updating role:', error);
        toast.error('Failed to update role');
      } else {
        toast.success('Role updated');
        fetchTeams();
      }
    } catch (err) {
      console.error('Unexpected error updating role:', err);
      toast.error('Failed to update role');
    } finally {
      setUpdatingRoles(prev => ({ ...prev, [teamMemberId]: false }));
    }
  };

  const handleRemoveMember = async (teamMemberId) => {
    setRemovingMembers(prev => ({ ...prev, [teamMemberId]: true }));
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', teamMemberId);

      if (error) {
        console.error('Error removing worker:', error);
        toast.error('Failed to remove worker');
      } else {
        toast.success('Worker removed');
        fetchTeams();
      }
    } catch (err) {
      console.error('Unexpected error removing worker:', err);
      toast.error('Failed to remove worker');
    } finally {
      setRemovingMembers(prev => ({ ...prev, [teamMemberId]: false }));
    }
  };

  const handleDeleteCrew = async (teamId) => {
    const team = teams.find(t => t.id === teamId);
    const jobCount = jobCounts[teamId] || 0;
    
    const confirmed = await confirm({
      title: 'Delete Crew?',
      message: jobCount > 0
        ? `This crew has ${jobCount} assigned job${jobCount === 1 ? '' : 's'}. Deleting this crew will unassign those jobs. This action cannot be undone.`
        : 'This action cannot be undone.',
      confirmText: 'Delete Crew',
      confirmVariant: 'danger'
    });

    if (!confirmed) return;

    setDeletingCrews(prev => ({ ...prev, [teamId]: true }));
    try {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);

      if (error) {
        console.error('Error deleting crew:', error);
        toast.error('Failed to delete crew');
      } else {
        toast.success('Crew deleted');
        fetchTeams();
      }
    } catch (err) {
      console.error('Unexpected error deleting crew:', err);
      toast.error('Failed to delete crew');
    } finally {
      setDeletingCrews(prev => ({ ...prev, [teamId]: false }));
    }
  };

  const handleStartRename = (teamId, currentName) => {
    setEditingCrewName(prev => ({ ...prev, [teamId]: currentName }));
  };

  const handleCancelRename = (teamId) => {
    setEditingCrewName(prev => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
  };

  const handleSaveRename = async (teamId) => {
    const newName = editingCrewName[teamId]?.trim();
    if (!newName) {
      toast.error('Crew name cannot be empty');
      return;
    }

    setRenamingCrews(prev => ({ ...prev, [teamId]: true }));
    try {
      const { error } = await supabase
        .from('teams')
        .update({ name: newName })
        .eq('id', teamId);

      if (error) {
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          toast.error('A crew with that name already exists');
        } else {
          console.error('Error renaming crew:', error);
          toast.error('Failed to rename crew');
        }
      } else {
        toast.success('Crew renamed');
        handleCancelRename(teamId);
        fetchTeams();
      }
    } catch (err) {
      console.error('Unexpected error renaming crew:', err);
      toast.error('Failed to rename crew');
    } finally {
      setRenamingCrews(prev => ({ ...prev, [teamId]: false }));
    }
  };

  // Group team members by team_id
  const membersByTeamId = {};
  teamMembers.forEach(tm => {
    if (!membersByTeamId[tm.team_id]) {
      membersByTeamId[tm.team_id] = [];
    }
    membersByTeamId[tm.team_id].push(tm);
  });

  // Get available workers for each team (not already in that team)
  const getAvailableWorkers = (teamId) => {
    const currentMemberIds = (membersByTeamId[teamId] || []).map(tm => tm.crew_member_id);
    return workers.filter(w => !currentMemberIds.includes(w.id));
  };

  // Get worker's current crew name
  const getWorkerCurrentCrew = (workerId) => {
    const teamMember = teamMembers.find(tm => tm.crew_member_id === workerId);
    if (!teamMember) return null;
    const team = teams.find(t => t.id === teamMember.team_id);
    return team?.name || null;
  };

  // Sort members: leaders first, then by name
  const sortMembers = (members) => {
    return [...members].sort((a, b) => {
      // Leaders first
      if (a.role === 'lead' && b.role !== 'lead') return -1;
      if (a.role !== 'lead' && b.role === 'lead') return 1;
      // Then alphabetically by name
      const nameA = a.crew_members?.full_name || '';
      const nameB = b.crew_members?.full_name || '';
      return nameA.localeCompare(nameB);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        subtitle={`Manage teams and their ${crewLabel.toLowerCase()} members`}
      />

      {/* Create Crew Form */}
      <Card>
        <form onSubmit={handleCreateTeam} className="space-y-3">
          <div>
            <label htmlFor="crew-name" className="block text-sm font-medium text-slate-700 mb-1">
              Crew Name
            </label>
            <div className="flex gap-3">
              <input
                id="crew-name"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter crew name"
                className="flex-1 border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                disabled={creating}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!teamName.trim() || creating || !companyId}
              >
                {creating ? 'Creating...' : 'Create Crew'}
              </Button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Crews can be 1 person or multiple workers. Each worker can belong to only one crew.
            </p>
          </div>
        </form>
      </Card>

      {loading ? (
        <Card>
          <div className="space-y-4">
            <div className="h-6 bg-slate-200 rounded animate-pulse w-1/3"></div>
            <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2"></div>
            <div className="h-4 bg-slate-200 rounded animate-pulse w-2/3"></div>
          </div>
        </Card>
      ) : teams.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No teams yet"
            description="Teams help you organize workers and assign jobs efficiently. Create your first team to get started."
            actionLabel="Create Team"
            onAction={() => document.getElementById('crew-name')?.focus()}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => {
            const members = membersByTeamId[team.id] || [];
            const memberCount = members.length;
            const sortedMembers = sortMembers(members);
            const jobCount = jobCounts[team.id] || 0;
            const isEditing = editingCrewName.hasOwnProperty(team.id);

            return (
              <Card key={team.id}>
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCrewName[team.id] || ''}
                            onChange={(e) => setEditingCrewName(prev => ({ ...prev, [team.id]: e.target.value }))}
                            className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveRename(team.id);
                              } else if (e.key === 'Escape') {
                                handleCancelRename(team.id);
                              }
                            }}
                          />
                          <button
                            onClick={() => handleSaveRename(team.id)}
                            disabled={renamingCrews[team.id]}
                            className="text-green-600 hover:text-green-700 disabled:opacity-50"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCancelRename(team.id)}
                            disabled={renamingCrews[team.id]}
                            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-800">
                              {team.name}
                            </h3>
                            <button
                              onClick={() => handleStartRename(team.id, team.name)}
                              className="text-slate-400 hover:text-slate-600 transition-colors"
                              title="Rename crew"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCrew(team.id)}
                              disabled={deletingCrews[team.id]}
                              className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="Delete crew"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-4 mt-1">
                            <p className="text-sm text-slate-500">
                              Members: {memberCount}
                            </p>
                            {jobCount > 0 && (
                              <p className="text-sm text-slate-500">
                                Assigned Jobs: {jobCount}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Add Worker Section */}
                  {!isEditing && (
                    <div className="border-t border-slate-200 pt-3">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Add Worker
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={selectedWorkers[team.id] || ''}
                          onChange={(e) => setSelectedWorkers(prev => ({ ...prev, [team.id]: e.target.value }))}
                          className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                          disabled={addingWorkers[team.id]}
                        >
                          <option value="">Select worker...</option>
                          {getAvailableWorkers(team.id).length > 0 ? (
                            getAvailableWorkers(team.id).map(worker => {
                              const currentCrew = getWorkerCurrentCrew(worker.id);
                              return (
                                <option key={worker.id} value={worker.id}>
                                  {worker.full_name}{currentCrew ? ` — Currently in "${currentCrew}"` : ' — Available'}
                                </option>
                              );
                            })
                          ) : (
                            <option value="" disabled>No available workers</option>
                          )}
                        </select>
                        <Button
                          onClick={() => handleAddWorker(team.id)}
                          variant="primary"
                          disabled={!selectedWorkers[team.id] || addingWorkers[team.id] || getAvailableWorkers(team.id).length === 0}
                          className="text-sm px-3"
                        >
                          {addingWorkers[team.id] ? 'Adding...' : 'Add'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Members List */}
                  {!isEditing && (
                    <div className="border-t border-slate-200 pt-3">
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Members:</h4>
                      {sortedMembers.length > 0 ? (
                        <ul className="space-y-2">
                          {sortedMembers.map(tm => {
                            const crewMember = tm.crew_members;
                            const role = tm.role || 'member';
                            const isUpdating = updatingRoles[tm.id];
                            const isRemoving = removingMembers[tm.id];
                            const isLead = role === 'lead';

                            return (
                              <li key={tm.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
                                <span className="text-sm text-slate-800 flex-1">
                                  {crewMember?.full_name || 'Unknown'}
                                  {isLead && (
                                    <span className="ml-2 text-xs font-medium text-amber-600">(Lead)</span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2">
                                  <select
                                    value={role}
                                    onChange={(e) => handleUpdateRole(tm.id, e.target.value)}
                                    disabled={isUpdating || isRemoving}
                                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                                  >
                                    <option value="member">Member</option>
                                    <option value="lead">Lead</option>
                                  </select>
                                  <Button
                                    onClick={() => handleRemoveMember(tm.id)}
                                    variant="danger"
                                    disabled={isUpdating || isRemoving}
                                    className="text-xs px-2 py-1"
                                  >
                                    {isRemoving ? '...' : 'Remove'}
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No workers assigned yet.</p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}

