import { useEffect } from 'react';
import Button from './Button';

/**
 * InputModal - Professional input dialog with textarea
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - title: string - Modal title
 * - message: string | ReactNode - Modal message content
 * - label: string - Label for input field (default: "Reason")
 * - placeholder: string - Placeholder text for input
 * - value: string - Current input value
 * - onChange: function - Called when input value changes (receives new value)
 * - confirmText: string - Text for confirm button (default: "Confirm")
 * - cancelText: string - Text for cancel button (default: "Cancel")
 * - confirmVariant: "danger" | "primary" | "secondary" - Confirm button variant (default: "danger")
 * - onConfirm: function - Called when user confirms
 * - onCancel: function - Called when user cancels
 * - loading: boolean - Shows loading state and disables buttons
 */
export default function InputModal({
  open,
  title,
  message,
  label = "Reason",
  placeholder = "",
  value = "",
  onChange,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  loading = false,
}) {
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

  if (!open) return null;

  const trimmedValue = value.trim();
  const isConfirmDisabled = loading || trimmedValue.length === 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
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
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 z-[10000]">
        <div className="p-6">
          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {title}
          </h3>

          {/* Message */}
          {message && (
            <div className="text-sm text-gray-600 mb-4">
              {message}
            </div>
          )}

          {/* Input Field */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {label}
            </label>
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={4}
              autoFocus
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              disabled={isConfirmDisabled}
            >
              {loading ? 'Working...' : confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

