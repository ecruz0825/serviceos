import { useState } from 'react';
import Button from '../ui/Button';

export default function CustomerCard({
  customer,
  customerLabel,
  hasUnpaidJobs,
  hasUpcomingJobs,
  smartLabels = [],
  isSelected,
  onToggleSelection,
  onViewJobsToggle,
  onCreateJob,
  onEdit,
  onDelete,
  onOpenTimeline,
  onOpenDetail,
  onInviteToPortal,
  onSetPassword,
  onCreateLogin,
  supportMode = false,
}) {
  const [showMoreActions, setShowMoreActions] = useState(false);

  const tags = Array.isArray(customer.tags) ? customer.tags : [];

  // One line metadata: email OR phone (not both)
  const metadataLine = customer.email || customer.phone || null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
      {/* Top row: identity + status + primary action */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(customer.id)}
            className="mt-1 flex-shrink-0 rounded border-slate-300"
          />
          <div className="flex-1 min-w-0">
            <h3
              className="text-base font-semibold text-slate-900 cursor-pointer hover:text-slate-700"
              onClick={() => onOpenDetail?.(customer.id)}
            >
              {customer.full_name}
            </h3>
            {metadataLine && (
              <p className="text-sm text-slate-500 mt-0.5 truncate">{metadataLine}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {/* Status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {smartLabels.includes('Unpaid') && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-100 text-amber-800">Unpaid</span>
            )}
            {smartLabels.includes('Overdue') && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-100 text-red-800">Overdue</span>
            )}
            {smartLabels.includes('Upcoming') && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-100 text-blue-800">Upcoming</span>
            )}
            {smartLabels.includes('Paid Up') && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-green-100 text-green-800">Paid Up</span>
            )}
            {smartLabels.includes('No Jobs') && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">No Jobs</span>
            )}
            {smartLabels.length === 0 && hasUnpaidJobs && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-100 text-amber-800">Unpaid</span>
            )}
            {smartLabels.length === 0 && hasUpcomingJobs && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-100 text-blue-800">Upcoming</span>
            )}
          </div>
          <Button
            onClick={() => onOpenDetail?.(customer.id)}
            variant="primary"
            size="sm"
          >
            Open
          </Button>
          <Button
            onClick={() => setShowMoreActions(!showMoreActions)}
            variant="tertiary"
            size="sm"
          >
            More
          </Button>
        </div>
      </div>

      {/* More menu — drawer-only actions removed from list view */}
      {showMoreActions && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex gap-2 flex-wrap">
            {onOpenTimeline && (
              <Button onClick={() => { setShowMoreActions(false); onOpenTimeline(customer.id); }} variant="tertiary" size="sm">
                Timeline
              </Button>
            )}
            <Button onClick={() => { setShowMoreActions(false); onEdit(customer); }} variant="tertiary" size="sm" disabled={supportMode} title={supportMode ? 'Customer editing is disabled in support mode' : undefined}>
              Edit
            </Button>
            <Button onClick={() => { setShowMoreActions(false); onDelete(customer.id); }} variant="danger" size="sm" disabled={supportMode} title={supportMode ? 'Customer deletion is disabled in support mode' : undefined}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Middle: key info only — Address, Phone, Tags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600">
        {customer.address && (
          <div className="truncate" title={customer.address}>
            <span className="font-medium text-slate-500">Address</span>{' '}
            <span className="text-slate-700">{customer.address}</span>
          </div>
        )}
        {customer.phone && (
          <div>
            <span className="font-medium text-slate-500">Phone</span>{' '}
            <span className="text-slate-700">{customer.phone}</span>
          </div>
        )}
        {tags.length > 0 && (
          <div className="sm:col-span-2 flex flex-wrap gap-1.5 items-center">
            <span className="font-medium text-slate-500">Tags</span>
            <span className="inline-flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                  {tag}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
