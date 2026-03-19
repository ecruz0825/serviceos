import { useState } from 'react';
import Card from '../ui/Card';
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
  supportMode = false, // Support mode flag to disable mutations
}) {
  const [showMoreActions, setShowMoreActions] = useState(false);

  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  const notesPreview = customer.notes ? customer.notes.split('\n')[0].substring(0, 60) + (customer.notes.length > 60 ? '...' : '') : '';

  return (
    <Card>
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(customer.id)}
            className="mt-1 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 
                className="text-base font-semibold text-slate-900 cursor-pointer hover:text-slate-700"
                onClick={() => onOpenDetail && onOpenDetail(customer.id)}
              >
                {customer.full_name}
              </h3>
              {/* Smart Labels & Tags */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Smart Labels - ordered: Unpaid, Overdue, Upcoming, Paid Up, No Jobs */}
                {smartLabels.includes('Unpaid') && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    Unpaid
                  </span>
                )}
                {smartLabels.includes('Overdue') && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Overdue
                  </span>
                )}
                {smartLabels.includes('Upcoming') && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Upcoming
                  </span>
                )}
                {smartLabels.includes('Paid Up') && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Paid Up
                  </span>
                )}
                {smartLabels.includes('No Jobs') && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    No Jobs
                  </span>
                )}
                {/* Legacy support - show if smartLabels not available */}
                {smartLabels.length === 0 && hasUnpaidJobs && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    Unpaid
                  </span>
                )}
                {smartLabels.length === 0 && hasUpcomingJobs && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Upcoming
                  </span>
                )}
                {/* User Tags */}
                {tags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Primary Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => onOpenDetail && onOpenDetail(customer.id)}
            variant="primary"
            className="text-sm"
          >
            Open
          </Button>
          <Button
            onClick={() => setShowMoreActions(!showMoreActions)}
            variant="tertiary"
            className="text-sm"
          >
            More
          </Button>
        </div>
      </div>

      {/* Secondary Actions (More menu) */}
      {showMoreActions && (
        <div className="pt-2 pb-3 border-b border-slate-200 space-y-3">
          {/* Customer Access Section */}
          {(onInviteToPortal || onCreateLogin || onSetPassword) && (
            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Customer Access</h4>
              <div className="flex gap-2 flex-wrap">
                {onCreateLogin && !customer.user_id && (
                  <Button 
                    onClick={() => { setShowMoreActions(false); onCreateLogin(customer); }} 
                    variant="secondary" 
                    className="text-sm"
                    disabled={supportMode || !customer.email}
                    title={supportMode ? 'User account creation is disabled in support mode' : (!customer.email ? 'Email required to create login' : 'Creates a permanent email and password login for the customer.')}
                  >
                    Create Customer Login
                  </Button>
                )}
                {onInviteToPortal && (
                  <Button 
                    onClick={() => { setShowMoreActions(false); onInviteToPortal(customer); }} 
                    variant="secondary" 
                    className="text-sm"
                    disabled={supportMode || !customer.email}
                    title={supportMode ? 'User invites are disabled in support mode' : (!customer.email ? 'Email required to invite' : 'Emails the customer a one-time secure link to access their portal.')}
                  >
                    Send Portal Access Link
                  </Button>
                )}
                {onSetPassword && customer.user_id && (
                  <Button 
                    onClick={() => { setShowMoreActions(false); onSetPassword(customer); }} 
                    variant="secondary" 
                    className="text-sm"
                    disabled={supportMode}
                    title={supportMode ? 'Password operations are disabled in support mode' : 'Set temporary password for customer login'}
                  >
                    Set Password
                  </Button>
                )}
              </div>
            </div>
          )}
          {/* Job Actions Section */}
          {(onCreateJob || onViewJobsToggle) && (
            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Job Actions</h4>
              <div className="flex gap-2 flex-wrap">
                {onCreateJob && (
                  <Button 
                    onClick={() => { setShowMoreActions(false); onCreateJob(customer.id); }} 
                    variant="primary" 
                    className="text-sm"
                    disabled={supportMode}
                    title={supportMode ? 'Job creation is disabled in support mode' : 'Create a new job for this customer'}
                  >
                    Create Job
                  </Button>
                )}
                {onViewJobsToggle && (
                  <Button onClick={() => { setShowMoreActions(false); onOpenDetail && onOpenDetail(customer.id, 'jobs'); }} variant="secondary" className="text-sm">
                    View Jobs
                  </Button>
                )}
              </div>
            </div>
          )}
          {/* Other Actions */}
          <div className="flex gap-2 flex-wrap">
            {onOpenTimeline && (
              <Button onClick={() => { setShowMoreActions(false); onOpenTimeline(customer.id); }} variant="secondary" className="text-sm">
                Timeline
              </Button>
            )}
            <Button onClick={() => { setShowMoreActions(false); onEdit(customer); }} variant="secondary" className="text-sm" disabled={supportMode} title={supportMode ? 'Customer editing is disabled in support mode' : undefined}>
              Edit
            </Button>
            <Button onClick={() => { setShowMoreActions(false); onDelete(customer.id); }} variant="danger" className="text-sm" disabled={supportMode} title={supportMode ? 'Customer deletion is disabled in support mode' : undefined}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Body (Collapsed by default, always visible) */}
      <div className="pt-3 space-y-2">
        {/* Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {customer.email && (
            <div className="text-slate-600">
              <span className="font-medium">Email:</span> {customer.email}
            </div>
          )}
          {customer.phone && (
            <div className="text-slate-600">
              <span className="font-medium">Phone:</span> {customer.phone}
            </div>
          )}
        </div>

        {/* Address */}
        {customer.address && (
          <div className="text-sm text-slate-600">
            <span className="font-medium">Address:</span>{' '}
            <span className="truncate block">{customer.address}</span>
          </div>
        )}

        {/* Meta Row */}
        {(tags.length > 0 || notesPreview) && (
          <div className="flex items-start gap-4 text-xs text-slate-500 pt-1">
            {tags.length > 0 && (
              <div>
                <span className="font-medium">Tags:</span> {tags.join(', ')}
              </div>
            )}
            {notesPreview && (
              <div className="flex-1 min-w-0">
                <span className="font-medium">Notes:</span> {notesPreview}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

