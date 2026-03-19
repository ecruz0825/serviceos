import { useEffect, useState } from 'react';
import Button from './Button';

/**
 * ConvertToJobModal - Modal for converting a quote to a job with scheduling options
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - defaultServiceDate: string (YYYY-MM-DD) - Default service date
 * - defaultEndDate: string (YYYY-MM-DD) - Default end date
 * - teams: array - List of teams {id, name}
 * - onConfirm: function(serviceDate, endDate, assignedTeamId) - Called when user confirms
 * - onCancel: function - Called when user cancels
 * - loading: boolean - Shows loading state and disables buttons
 */
export default function ConvertToJobModal({
  open,
  defaultServiceDate = '',
  defaultEndDate = '',
  teams = [],
  onConfirm,
  onCancel,
  loading = false,
}) {
  // All hooks must be declared unconditionally at the top
  // Use local state for form fields
  const [serviceDate, setServiceDate] = useState(defaultServiceDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [assignedTeamId, setAssignedTeamId] = useState('');
  const [dateError, setDateError] = useState('');

  // Reset form when modal opens/closes or defaults change
  useEffect(() => {
    if (open) {
      setServiceDate(defaultServiceDate);
      setEndDate(defaultEndDate);
      setAssignedTeamId('');
      setDateError('');
    }
  }, [open, defaultServiceDate, defaultEndDate]);

  // Validate date ordering
  useEffect(() => {
    if (!open) return;
    
    if (serviceDate && endDate && endDate < serviceDate) {
      setDateError('End date must be on or after service date');
    } else {
      setDateError('');
    }
  }, [open, serviceDate, endDate]);

  // Handle ESC key
  useEffect(() => {
    if (!open || loading) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, loading, onCancel]);

  // Short-circuit rendering AFTER all hooks
  if (!open) return null;

  const handleConfirm = () => {
    if (dateError) {
      return; // Don't allow submission with date error
    }
    
    // Convert empty strings to null for optional fields
    const finalServiceDate = serviceDate.trim() || null;
    const finalEndDate = endDate.trim() || null;
    const finalAssignedTeamId = assignedTeamId.trim() || null;
    
    onConfirm(finalServiceDate, finalEndDate, finalAssignedTeamId);
  };

  const isConfirmDisabled = loading || !!dateError;

  // Get today's date in YYYY-MM-DD format for min attribute
  const today = new Date().toISOString().split('T')[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        // Close on backdrop click (unless loading)
        if (e.target === e.currentTarget && !loading) {
          onCancel();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" />

      {/* Modal Card */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 z-10">
        <div className="p-6">
          {/* Title */}
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Convert Quote to Job
          </h3>
          <p className="text-sm text-slate-600 mb-6">
            Set scheduling and team assignment for the new job. All fields are optional.
          </p>

          {/* Service Date Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Service Date
              <span className="text-slate-500 text-xs ml-1">(optional)</span>
            </label>
            <input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              min={today}
              disabled={loading}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              autoFocus
            />
            {!serviceDate && (
              <p className="text-xs text-amber-600 mt-1">
                Job will be created without a scheduled date (Needs Scheduling)
              </p>
            )}
          </div>

          {/* End Date Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              End Date
              <span className="text-slate-500 text-xs ml-1">(optional)</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={serviceDate || today}
              disabled={loading}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            {dateError && (
              <p className="text-xs text-red-600 mt-1">{dateError}</p>
            )}
          </div>

          {/* Assigned Team Field */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Assigned Team
              <span className="text-slate-500 text-xs ml-1">(optional)</span>
            </label>
            <select
              value={assignedTeamId}
              onChange={(e) => setAssignedTeamId(e.target.value)}
              disabled={loading}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              <option value="">Unassigned</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
            >
              {loading ? 'Converting...' : 'Convert to Job'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
