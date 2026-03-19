import { useState, useEffect } from 'react';
import Button from '../ui/Button';

/**
 * LogCollectionActionModal - Modal for logging collection actions
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - actionType: 'contacted' | 'promise_to_pay' | 'resolved' | 'note' - Type of action
 * - customerName: string - Customer name for display
 * - onConfirm: function(actionType, note, promiseDate, promiseAmount) - Called when user confirms
 * - onCancel: function - Called when user cancels
 * - loading: boolean - Shows loading state and disables buttons
 */
export default function LogCollectionActionModal({
  open,
  actionType,
  customerName = '',
  onConfirm,
  onCancel,
  loading = false,
}) {
  const [note, setNote] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [dateError, setDateError] = useState('');

  // Reset form when modal opens/closes or actionType changes
  useEffect(() => {
    if (open) {
      setNote('');
      setPromiseDate('');
      setPromiseAmount('');
      setDateError('');
    }
  }, [open, actionType]);

  // Validate promise date
  useEffect(() => {
    if (!open) return;
    
    if (promiseDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(promiseDate);
      
      if (selectedDate < today) {
        setDateError('Promise date must be today or in the future');
      } else {
        setDateError('');
      }
    } else {
      setDateError('');
    }
  }, [open, promiseDate]);

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

  const getActionTitle = () => {
    switch (actionType) {
      case 'contacted':
        return 'Log Contact';
      case 'promise_to_pay':
        return 'Log Promise to Pay';
      case 'resolved':
        return 'Mark as Resolved';
      case 'note':
        return 'Add Note';
      default:
        return 'Log Action';
    }
  };

  const getActionDescription = () => {
    switch (actionType) {
      case 'contacted':
        return 'Record that you contacted this customer.';
      case 'promise_to_pay':
        return 'Record a promise to pay from the customer.';
      case 'resolved':
        return 'Mark this customer\'s collection issue as resolved.';
      case 'note':
        return 'Add a note about this customer.';
      default:
        return '';
    }
  };

  const handleConfirm = () => {
    if (dateError) {
      return; // Don't allow submission with date error
    }
    
    // Validate required fields
    if (actionType === 'promise_to_pay' && !promiseDate) {
      setDateError('Promise date is required');
      return;
    }
    
    // Convert empty strings to null for optional fields
    const finalNote = note.trim() || null;
    const finalPromiseDate = promiseDate.trim() || null;
    const finalPromiseAmount = promiseAmount.trim() ? parseFloat(promiseAmount) : null;
    
    onConfirm(actionType, finalNote, finalPromiseDate, finalPromiseAmount);
  };

  const isConfirmDisabled = loading || !!dateError || (actionType === 'promise_to_pay' && !promiseDate);

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
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {getActionTitle()}
          </h3>
          {customerName && (
            <p className="text-sm text-slate-600 mb-4">
              Customer: <span className="font-medium">{customerName}</span>
            </p>
          )}
          <p className="text-sm text-slate-600 mb-6">
            {getActionDescription()}
          </p>

          {/* Note Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Note
              <span className="text-slate-500 text-xs ml-1">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
              rows={3}
              placeholder="Add details about this action..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              autoFocus
            />
          </div>

          {/* Promise Date Field (only for promise_to_pay) */}
          {actionType === 'promise_to_pay' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Promise Date
                <span className="text-red-500 text-xs ml-1">*</span>
              </label>
              <input
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                min={today}
                disabled={loading}
                required
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
              {dateError && (
                <p className="text-xs text-red-600 mt-1">{dateError}</p>
              )}
            </div>
          )}

          {/* Promise Amount Field (only for promise_to_pay) */}
          {actionType === 'promise_to_pay' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Promise Amount
                <span className="text-slate-500 text-xs ml-1">(optional)</span>
              </label>
              <input
                type="number"
                value={promiseAmount}
                onChange={(e) => setPromiseAmount(e.target.value)}
                disabled={loading}
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
            </div>
          )}

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
              {loading ? 'Logging...' : 'Log Action'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
