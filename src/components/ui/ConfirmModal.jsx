import { useEffect } from 'react';
import Button from './Button';

/**
 * ConfirmModal - Professional confirmation dialog
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - title: string - Modal title
 * - message: string | ReactNode - Modal message content
 * - confirmText: string - Text for confirm button (default: "Confirm")
 * - cancelText: string - Text for cancel button (default: "Cancel")
 * - confirmVariant: "danger" | "primary" | "secondary" - Confirm button variant (default: "danger")
 * - onConfirm: function - Called when user confirms
 * - onCancel: function - Called when user cancels
 * - loading: boolean - Shows loading state and disables buttons
 */
export default function ConfirmModal({
  open,
  title,
  message,
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
          <div className="text-sm text-gray-600 mb-6">
            {message}
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
              disabled={loading}
            >
              {loading ? 'Working...' : confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

