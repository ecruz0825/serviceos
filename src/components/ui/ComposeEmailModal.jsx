import { useEffect, useState } from 'react';
import Button from './Button';

/**
 * ComposeEmailModal - Email composition modal for quotes
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - to: string - Default "To" email address
 * - subject: string - Default subject
 * - body: string - Default body
 * - onConfirm: function(to, subject, body) - Called when user confirms
 * - onCancel: function - Called when user cancels
 * - loading: boolean - Shows loading state and disables buttons
 */
export default function ComposeEmailModal({
  open,
  to: defaultTo = '',
  subject: defaultSubject = '',
  body: defaultBody = '',
  onConfirm,
  onCancel,
  loading = false,
}) {
  // All hooks must be declared unconditionally at the top
  // Use local state for form fields
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  // Reset form when modal opens/closes or defaults change
  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody(defaultBody);
    }
  }, [open, defaultTo, defaultSubject, defaultBody]);

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
    const trimmedTo = to.trim();
    const trimmedSubject = subject.trim();
    
    if (!trimmedTo || !trimmedSubject) {
      return; // Validation will disable button
    }
    
    onConfirm(trimmedTo, trimmedSubject, body.trim());
  };

  const trimmedTo = to.trim();
  const trimmedSubject = subject.trim();
  const isConfirmDisabled = loading || !trimmedTo || !trimmedSubject;

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
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 z-10 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Compose Email
          </h3>

          {/* To Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              To <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              autoFocus
            />
          </div>

          {/* Subject Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quote subject"
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Body Field */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Body <span className="text-gray-500 text-xs">(optional but recommended)</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body..."
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={8}
            />
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
              {loading ? 'Queueing...' : 'Queue Email'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

