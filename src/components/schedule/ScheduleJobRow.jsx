import Button from '../ui/Button';
import { parseISO, format } from 'date-fns';

export default function ScheduleJobRow({
  job,
  customer,
  crewMembers,
  teams = [],
  teamMembers = [],
  crewLabel,
  onOpen,
  onAssignCrew,
  scheduleRequestByJobId = {},
}) {
  const getStatusBadge = (status) => {
    const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
    if (status === "Completed")
      return <span className={`${base} bg-green-100 text-green-800`}>{status}</span>;
    if (status === "In Progress")
      return <span className={`${base} bg-blue-100 text-blue-800`}>{status}</span>;
    if (status === "Canceled")
      return <span className={`${base} bg-slate-200 text-slate-700`}>{status}</span>;
    return <span className={`${base} bg-amber-100 text-amber-800`}>{status}</span>;
  };

  // Get assignee name with fallback
  const getAssigneeName = () => {
    // Primary: use assigned_team_id
    if (job.assigned_team_id) {
      const team = teams.find(t => t.id === job.assigned_team_id);
      if (team) {
        const memberCount = teamMembers.filter(tm => tm.team_id === team.id).length;
        if (memberCount === 1) {
          const teamMember = teamMembers.find(tm => tm.team_id === team.id);
          if (teamMember?.crew_members) {
            return teamMember.crew_members.full_name;
          }
        }
        return team.name;
      }
    }
    
    return "Unassigned";
  };

  const assigneeName = getAssigneeName();
  const requestedDate = scheduleRequestByJobId[job.id];
  const formattedRequestDate = requestedDate ? format(parseISO(requestedDate), 'MMM d') : null;

  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4 hover:bg-slate-50/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-medium text-slate-900">
            {job.services_performed || "Untitled Job"}
          </h4>
          {getStatusBadge(job.status)}
        </div>
        <p className="text-xs text-slate-600 mt-0.5">{customer?.full_name || "—"}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
          <span>{assigneeName}</span>
          {job.job_cost && (
            <>
              <span className="text-slate-300">•</span>
              <span>${job.job_cost.toFixed(2)}</span>
            </>
          )}
        </div>
        {formattedRequestDate && (
          <div className="text-xs text-slate-500 italic mt-1">
            Requested: {formattedRequestDate}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <select
          value={job.assigned_team_id || ""}
          onChange={(e) => onAssignCrew(job.id, e.target.value)}
          className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">Unassigned</option>
          {teams.map((team) => {
            const memberCount = teamMembers.filter(tm => tm.team_id === team.id).length;
            const displayName = memberCount === 1 
              ? (teamMembers.find(tm => tm.team_id === team.id)?.crew_members?.full_name || team.name)
              : team.name;
            return (
              <option key={team.id} value={team.id}>
                {displayName}
              </option>
            );
          })}
        </select>
        <Button
          onClick={() => onOpen(job)}
          variant="tertiary"
          className="text-xs"
        >
          Open
        </Button>
      </div>
    </div>
  );
}

