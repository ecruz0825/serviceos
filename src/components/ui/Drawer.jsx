import { useEffect } from 'react';

/**
 * Drawer - Right-side sliding drawer component
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether drawer is open
 * @param {string} props.title - Drawer title
 * @param {React.ReactNode} props.children - Drawer content
 * @param {React.ReactNode} [props.footer] - Optional footer content
 * @param {Function} props.onClose - Close handler
 * @param {string} [props.widthClass] - Width classes (default: "w-full sm:max-w-[520px]")
 * @param {boolean} [props.disableClose] - Disable closing (e.g., when saving)
 */
export default function Drawer({
  open,
  title,
  children,
  footer,
  onClose,
  widthClass = "w-full sm:max-w-[520px]",
  disableClose = false,
}) {
  // Handle ESC key
  useEffect(() => {
    if (!open || disableClose) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, disableClose, onClose]);

  // Handle body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[60] transition-opacity duration-200 opacity-100"
        onClick={disableClose ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 right-0 h-full bg-white border-l border-slate-200 shadow-xl z-[60] ${widthClass} flex flex-col transition-transform duration-200 ease-out translate-x-0`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <h2 id="drawer-title" className="text-xl font-bold text-slate-900">
            {title}
          </h2>
          <button
            onClick={disableClose ? undefined : onClose}
            disabled={disableClose}
            className="rounded-md p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>

        {/* Sticky Footer */}
        {footer && (
          <div className="border-t border-slate-200 bg-white p-4 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

