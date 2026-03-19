import { useState } from "react";
import { Link } from "react-router-dom";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import InvoiceActions from "../InvoiceActions";
import { getJobNextAction } from "../../lib/nextActionEngine";
import { getJobNextStep } from "../../lib/nextStepHints";
import { useNavigate } from "react-router-dom";
import { FileText, Calendar } from "lucide-react";
import { formatDate } from "../../utils/dateFormatting";
import { formatCurrencyFixed, formatAmount } from "../../utils/currencyFormatting";

export default function JobCard({
  job,
  customer,
  crewMember,
  crewMembers,
  teams = [],
  teamMembers = [],
  getTeamDisplayName,
  getJobAssigneeName,
  feedbackItem,
  jobFlags = [], // Array of open job flags
  customerLabel,
  crewLabel,
  dense = false,
  scheduleRequest = null,
  onEdit,
  onDelete,
  onAssignCrew,
  onGenerateInvoice,
  onEmailInvoice,
  onViewInvoice,
  onDownloadInvoice,
  onAddToCalendar,
  onGoogleCalendar,
  onEmailCustomer,
  balanceDue = 0, // Optional: outstanding balance for payment actions
  billingDisabled = false, // Billing read-only flag to disable mutations
  supportMode = false, // Support mode read-only flag to disable mutations
}) {
  const [showMore, setShowMore] = useState(false);
  const navigate = useNavigate();
  
  // Get next action for this job
  const nextAction = getJobNextAction(job, { balanceDue });

  // Map job status to Badge variant
  const getStatusVariant = (status) => {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'completed') return 'success';
    if (normalized === 'in progress' || normalized === 'in_progress') return 'info';
    if (normalized === 'canceled' || normalized === 'cancelled') return 'neutral';
    // Pending, Scheduled, etc. -> warning
    return 'warning';
  };

  // Determine disabled states for secondary actions
  const hasCustomerEmail = !!customer?.email;
  const emailDisabled = !hasCustomerEmail;
  const emailReason = hasCustomerEmail
    ? `Email ${customerLabel.toLowerCase()}`
    : `This ${customerLabel.toLowerCase()} doesn't have an email on file`;

  return (
    <Card>
      <div className={dense ? "space-y-1" : "space-y-2"}>
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex-1">
            <h3 className={dense ? "text-sm font-semibold text-slate-800" : "text-base font-semibold text-slate-800"}>
              {job.services_performed || job.title || "Untitled Job"}
            </h3>
            <p className={dense ? "text-xs text-slate-500 mt-0.5" : "text-sm text-slate-500 mt-0.5"}>{customer?.full_name || "—"}</p>
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
            <div className="flex flex-col items-end gap-1">
              <Badge variant={getStatusVariant(job.status)}>
                {job.status || 'Unknown'}
              </Badge>
              <span className={dense ? "text-xs text-slate-500" : "text-xs text-slate-500"}>
                {getJobNextStep(job)}
              </span>
            </div>
            <span className={dense ? "text-xs text-slate-500" : "text-sm text-slate-500"}>
              {formatDate(job.service_date)}
            </span>
            {scheduleRequest && (
              <div className="flex flex-col items-end gap-1">
                <Badge variant="info">
                  Schedule Request
                </Badge>
                {scheduleRequest.requested_date && (
                  <span className="text-xs text-blue-600">
                    Requested: {formatDate(scheduleRequest.requested_date)}
                  </span>
                )}
              </div>
            )}
            {jobFlags.length > 0 && (
              <div className="flex flex-col items-end gap-1">
                <Badge variant={jobFlags.some(f => f.severity === 'high') ? 'danger' : jobFlags.some(f => f.severity === 'medium') ? 'warning' : 'info'}>
                  {jobFlags.length} Issue{jobFlags.length !== 1 ? 's' : ''}
                </Badge>
                {jobFlags[0]?.severity && (
                  <span className={`text-xs ${jobFlags[0].severity === 'high' ? 'text-red-600' : jobFlags[0].severity === 'medium' ? 'text-orange-600' : 'text-yellow-600'}`}>
                    {jobFlags[0].severity.toUpperCase()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Job Flags Alert */}
        {jobFlags.length > 0 && (
          <div className={`${dense ? 'p-2' : 'p-3'} rounded-lg border ${
            jobFlags.some(f => f.severity === 'high') 
              ? 'bg-red-50 border-red-200' 
              : jobFlags.some(f => f.severity === 'medium') 
                ? 'bg-orange-50 border-orange-200' 
                : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-start gap-2">
              <span className="text-sm font-semibold text-slate-900">⚠️ Flagged Issues:</span>
            </div>
            <div className="mt-1 space-y-1">
              {jobFlags.map((flag) => (
                <div key={flag.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      flag.severity === 'high' 
                        ? 'bg-red-100 text-red-800' 
                        : flag.severity === 'medium' 
                          ? 'bg-orange-100 text-orange-800' 
                          : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {flag.severity.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-600">{flag.category}</span>
                  </div>
                  <p className="text-xs text-slate-700 mt-0.5">{flag.message}</p>
                  {flag.created_at && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDate(flag.created_at)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Action Button */}
        {nextAction && (
          <div className="flex items-center">
            <Button
              variant={nextAction.kind === 'primary' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                if (nextAction.route) {
                  navigate(nextAction.route);
                } else if (nextAction.key === 'schedule_job') {
                  onEdit(job);
                } else if (nextAction.key === 'generate_invoice') {
                  onGenerateInvoice(job);
                } else if (nextAction.key === 'record_payment') {
                  navigate(`/admin/payments?jobId=${job.id}`);
                }
              }}
              className="text-xs"
            >
              {nextAction.label}
            </Button>
          </div>
        )}

        {/* Meta Row */}
        <div className={`flex flex-wrap items-center ${dense ? "gap-x-2 gap-y-0.5" : "gap-x-3 gap-y-1"} text-sm text-slate-600`}>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-slate-500">{crewLabel}:</label>
            <select
              value={job.assigned_team_id || ""}
              onChange={(e) => onAssignCrew(job.id, e.target.value)}
              className="border rounded px-2 py-0.5 text-sm bg-white"
              disabled={billingDisabled || supportMode}
              title={billingDisabled || supportMode ? "Assignment disabled" : "Assign team"}
            >
              <option value="">Unassigned</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name || 'Unnamed Team'}
                </option>
              ))}
            </select>
            {job.service_date && (
              <Link 
                to={`/admin/operations?tab=schedule&focusDate=${job.service_date.split('T')[0]}&jobId=${job.id}`}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline ml-1"
                title="Open in Schedule for route-aware assignment"
              >
                <Calendar className="h-3 w-3 inline" />
                <span className="sr-only">Open in Schedule</span>
              </Link>
            )}
          </div>

          <span className="text-slate-400">•</span>

          <div>
            <span className="font-medium">{formatCurrencyFixed(job.job_cost || 0)}</span>
          </div>

          {job.crew_pay && (
            <>
              <span className="text-slate-400">•</span>
              <div>
                <span className="text-slate-500">Labor Pay:</span> <span className="font-medium">{formatCurrencyFixed(job.crew_pay)}</span>
              </div>
            </>
          )}

          <span className="text-slate-400">•</span>

          <div>
            {feedbackItem ? (
              <div className="flex items-center gap-1">
                <span>⭐</span>
                <span className="font-medium">{feedbackItem.rating}/5</span>
                {feedbackItem.comment && (
                  <span className="text-xs italic ml-1 text-slate-500">({feedbackItem.comment})</span>
                )}
              </div>
            ) : (
              <span className="text-slate-400 italic">No feedback</span>
            )}
          </div>
        </div>

        {/* Primary Actions Row */}
        <div className={`flex flex-wrap ${dense ? "gap-1" : "gap-2"} items-center pt-2 border-t border-slate-200`}>
          <Button 
            onClick={() => onEdit(job)} 
            variant="tertiary"
            title="Edit job details"
          >
            Edit
          </Button>
          <Button 
            onClick={() => onDelete(job.id)} 
            variant="danger"
            title="Delete this job"
          >
            Delete
          </Button>
          {job.customer_id && (
            <Button
              onClick={() => navigate(`/admin/quotes/new?customer_id=${job.customer_id}`)}
              variant="secondary"
              size="sm"
              title="Create a quote for this customer"
              className="flex items-center gap-1"
            >
              <FileText className="h-3 w-3" />
              Quote
            </Button>
          )}
          <InvoiceActions
            job={job}
            onGenerateInvoice={onGenerateInvoice}
            onEmailInvoice={onEmailInvoice}
            onViewInvoice={onViewInvoice}
            onDownloadInvoice={onDownloadInvoice}
          />
        </div>

        {/* Secondary Actions (Collapsible) */}
        <div>
          <Button
            onClick={() => setShowMore(!showMore)}
            variant="tertiary"
            className="text-sm"
          >
            {showMore ? "▼ Less" : "▶ More actions"}
          </Button>

          {showMore && (
            <div className="mt-2 grid sm:grid-cols-3 gap-2">
              <Button
                onClick={() => onAddToCalendar(job, customer)}
                variant="secondary"
                title="Add to calendar (downloads .ics file)"
              >
                Add to Calendar
              </Button>
              <Button
                onClick={() => onGoogleCalendar(job, customer)}
                variant="tertiary"
                title="Add to Google Calendar (opens in browser)"
              >
                Google Calendar
              </Button>
              <Button
                onClick={() => onEmailCustomer(job, customer)}
                variant="secondary"
                disabled={emailDisabled}
                title={emailDisabled ? emailReason : `Email ${customerLabel.toLowerCase()}`}
              >
                Email {customerLabel}
              </Button>
            </div>
          )}

          {/* Mobile hint for email if disabled */}
          {showMore && emailDisabled && (
            <p className="text-xs text-amber-600 mt-1 sm:hidden">{emailReason}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

