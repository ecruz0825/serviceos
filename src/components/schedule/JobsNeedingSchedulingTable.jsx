import { Calendar } from 'lucide-react';
import Button from '../ui/Button';
import useCompanySettings from '../../hooks/useCompanySettings';

/**
 * JobsNeedingSchedulingTable - Presentational component for displaying jobs needing scheduling
 * 
 * @param {Array} mergedData - Array of merged job data (job + quote + customer)
 * @param {Array} teams - Array of team objects
 * @param {string} assigningJobId - ID of job currently being assigned
 * @param {string} schedulingJobId - ID of job currently being scheduled
 * @param {string} selectedTeamId - Currently selected team ID for assignment
 * @param {Function} onAssignTeam - Callback when team assignment changes (jobId, teamId) => void
 * @param {Function} onScheduleClick - Callback when schedule button clicked (jobId) => void
 * @param {Function} onScheduleInCalendar - Callback when schedule in calendar button clicked (job) => void
 * @param {Function} onOpenJob - Callback when open job button clicked (jobId) => void
 */
export default function JobsNeedingSchedulingTable({
  mergedData,
  teams,
  assigningJobId,
  schedulingJobId,
  selectedTeamId,
  onAssignTeam,
  onScheduleClick,
  onScheduleInCalendar,
  onOpenJob,
}) {
  const { settings } = useCompanySettings();
  const customerLabel = settings?.customer_label || "Customer";

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not set';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Invalid';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Quote #</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{customerLabel}</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Services</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Service Date</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">End Date</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Assigned Team</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mergedData.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-3 px-4 text-sm text-slate-900">
                {item.quote?.quote_number || '—'}
              </td>
              <td className="py-3 px-4 text-sm text-slate-700">
                {item.customer?.full_name || item.customer_id || '—'}
              </td>
              <td className="py-3 px-4 text-sm text-slate-600">
                {item.servicesSummary || '—'}
              </td>
              <td className="py-3 px-4 text-sm text-slate-600">
                {formatDate(item.service_date)}
              </td>
              <td className="py-3 px-4 text-sm text-slate-600">
                {formatDate(item.scheduled_end_date)}
              </td>
              <td className="py-3 px-4 text-sm text-slate-600">
                {item.assigned_team_id ? (
                  teams.find(t => t.id === item.assigned_team_id)?.name || 'Unknown'
                ) : (
                  <span className="text-amber-600 font-medium">Unassigned</span>
                )}
              </td>
              <td className="py-3 px-4">
                <div className="flex flex-wrap gap-2">
                  {/* Assign Team */}
                  <div className="flex items-center gap-1">
                    <select
                      value={assigningJobId === item.id ? selectedTeamId : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          onAssignTeam(item.id, e.target.value);
                        }
                      }}
                      disabled={assigningJobId === item.id}
                      className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">Assign...</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Schedule Dates */}
                  <Button
                    variant="secondary"
                    onClick={() => onScheduleClick(item.id)}
                    className="text-xs px-2 py-1"
                  >
                    {schedulingJobId === item.id ? 'Cancel' : 'Schedule'}
                  </Button>

                  {/* Schedule in Calendar */}
                  <Button
                    variant="secondary"
                    onClick={() => onScheduleInCalendar(item)}
                    className="text-xs px-2 py-1 flex items-center gap-1"
                    title="Open in schedule calendar"
                  >
                    <Calendar className="w-3 h-3" />
                    Schedule
                  </Button>

                  {/* Open Job */}
                  <Button
                    variant="tertiary"
                    onClick={() => onOpenJob(item.id)}
                    className="text-xs px-2 py-1"
                  >
                    Open
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
