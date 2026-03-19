import { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';

/**
 * DateSchedulingModal - Modal for scheduling job dates
 * 
 * @param {boolean} open - Whether modal is open
 * @param {Object} job - Job object with service_date and scheduled_end_date (optional)
 * @param {Function} onSave - Callback when save button clicked (serviceDate, endDate) => void
 * @param {Function} onCancel - Callback when cancel button clicked or backdrop clicked => void
 */
export default function DateSchedulingModal({ open, job, onSave, onCancel }) {
  const [scheduleDates, setScheduleDates] = useState({
    service_date: '',
    scheduled_end_date: ''
  });

  // Initialize dates from job when modal opens or job changes
  useEffect(() => {
    if (open && job) {
      setScheduleDates({
        service_date: job.service_date ? job.service_date.split('T')[0] : '',
        scheduled_end_date: job.scheduled_end_date ? job.scheduled_end_date.split('T')[0] : ''
      });
    } else if (!open) {
      // Reset when closed
      setScheduleDates({ service_date: '', scheduled_end_date: '' });
    }
  }, [open, job]);

  if (!open) return null;

  const handleSave = () => {
    if (!scheduleDates.service_date) {
      return; // Validation should be handled by parent
    }
    onSave(scheduleDates.service_date, scheduleDates.scheduled_end_date || null);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Schedule Dates</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Service Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={scheduleDates.service_date}
                onChange={(e) => {
                  const newStart = e.target.value;
                  let newEnd = scheduleDates.scheduled_end_date;
                  // If end date is before new start, set end = start
                  if (newEnd && newStart && newEnd < newStart) {
                    newEnd = newStart;
                  }
                  setScheduleDates({
                    service_date: newStart,
                    scheduled_end_date: newEnd
                  });
                }}
                className="w-full border border-slate-300 rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={scheduleDates.scheduled_end_date}
                onChange={(e) => {
                  const newEnd = e.target.value;
                  const start = scheduleDates.service_date;
                  // If end date is before start, set end = start
                  let finalEnd = newEnd;
                  if (start && newEnd && newEnd < start) {
                    finalEnd = start;
                  }
                  setScheduleDates({
                    ...scheduleDates,
                    scheduled_end_date: finalEnd
                  });
                }}
                min={scheduleDates.service_date || undefined}
                className="w-full border border-slate-300 rounded px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-1">Leave empty for single-day jobs</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="tertiary"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!scheduleDates.service_date}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
