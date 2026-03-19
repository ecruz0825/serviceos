import { useEffect, useRef } from 'react';
import Drawer from '../ui/Drawer';
import Button from '../ui/Button';
import ScheduleJobRow from './ScheduleJobRow';

export default function DayJobsDrawer({
  open,
  onClose,
  selectedDate,
  jobs,
  customersById,
  crewMembers,
  teams = [],
  teamMembers = [],
  crewLabel,
  selectedCrew,
  onCrewFilterChange,
  includeCanceled,
  onIncludeCanceledChange,
  onOpenJob,
  onAssignCrew,
  onCreateJob,
  highlightJobId,
  scheduleRequestByJobId = {},
}) {
  const highlightRef = useRef(null);

  // Scroll to highlighted job when drawer opens
  useEffect(() => {
    if (open && highlightJobId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [open, highlightJobId]);
  const formatDateHeader = (dateStr) => {
    if (!dateStr) return 'No Date';
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} — Schedule`;
  };

  return (
    <Drawer
      open={open}
      title={formatDateHeader(selectedDate)}
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button onClick={onCreateJob} variant="primary">
            Create Job
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="space-y-3 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">{crewLabel}:</label>
            <select
              value={selectedCrew}
              onChange={(e) => onCrewFilterChange(e.target.value)}
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">All {crewLabel}</option>
              {teams.map(team => {
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
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeCanceled}
              onChange={(e) => onIncludeCanceledChange(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Include Canceled</span>
          </label>
        </div>

        {/* Jobs List */}
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>No jobs scheduled for this day</p>
          </div>
        ) : (
          <div className="space-y-0">
            {jobs.map((job, idx) => {
              const customer = customersById[job.customer_id];
              const isHighlighted = job.id === highlightJobId;
              return (
                <div
                  key={job.id}
                  ref={isHighlighted ? highlightRef : null}
                  className={`transition-all ${
                    isHighlighted ? 'ring-2 ring-blue-400 bg-blue-50/50 rounded-md' : ''
                  } ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <ScheduleJobRow
                    job={job}
                    customer={customer}
                    crewMembers={crewMembers}
                    teams={teams}
                    teamMembers={teamMembers}
                    crewLabel={crewLabel}
                    onOpen={onOpenJob}
                    onAssignCrew={onAssignCrew}
                    scheduleRequestByJobId={scheduleRequestByJobId}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}

