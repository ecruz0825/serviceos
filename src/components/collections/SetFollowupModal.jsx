import { useState, useEffect } from 'react';
import Button from '../ui/Button';

/**
 * SetFollowupModal - Modal for setting collection follow-up dates
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - customerName: string - Customer name for display
 * - existingFollowupAt: string (ISO) - Existing follow-up date if any
 * - onConfirm: function(nextFollowupAt) - Called when user confirms
 * - onCancel: function - Called when user cancels
 * - loading: boolean - Shows loading state and disables buttons
 */
export default function SetFollowupModal({
  open,
  customerName = '',
  existingFollowupAt = null,
  onConfirm,
  onCancel,
  loading = false,
}) {
  const [dateTime, setDateTime] = useState('');
  const [dateError, setDateError] = useState('');

  // Initialize with existing follow-up or default to tomorrow
  useEffect(() => {
    if (open) {
      if (existingFollowupAt) {
        // Convert ISO string to local datetime-local format
        const date = new Date(existingFollowupAt);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        setDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        // Default to tomorrow at 9 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const hours = String(tomorrow.getHours()).padStart(2, '0');
        const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
        setDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
      }
      setDateError('');
    }
  }, [open, existingFollowupAt]);

  // Validate date is in the future
  useEffect(() => {
    if (!open || !dateTime) return;
    
    const selected = new Date(dateTime);
    const now = new Date();
    
    if (selected <= now) {
      setDateError('Follow-up date must be in the future');
    } else {
      setDateError('');
    }
  }, [open, dateTime]);

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
    if (dateError || !dateTime) {
      return;
    }
    
    // Convert to ISO string for database
    const date = new Date(dateTime);
    onConfirm(date.toISOString());
  };

  const isConfirmDisabled = loading || !!dateError || !dateTime;

  // Get current datetime for min attribute
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const minDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

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
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Set Follow-up
          </h3>
          {customerName && (
            <p className="text-sm text-slate-600 mb-4">
              Customer: <span className="font-medium">{customerName}</span>
            </p>
          )}
          <p className="text-sm text-slate-600 mb-6">
            Schedule a follow-up reminder for this customer.
          </p>

          {/* Date/Time Field */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Follow-up Date & Time
              <span className="text-red-500 text-xs ml-1">*</span>
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              min={minDateTime}
              disabled={loading}
              required
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              autoFocus
            />
            {dateError && (
              <p className="text-xs text-red-600 mt-1">{dateError}</p>
            )}
            {!dateError && dateTime && (
              <p className="text-xs text-slate-500 mt-1">
                {new Date(dateTime).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </p>
            )}
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
              {loading ? 'Setting...' : 'Set Follow-up'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
