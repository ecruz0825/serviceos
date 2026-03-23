import { useState } from "react";
import { Link } from "react-router-dom";
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

  const cardPadding = dense ? "p-3" : "p-4";
  const sectionGap = dense ? "space-y-2.5" : "space-y-3";

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${cardPadding}`}>
      <div className={sectionGap}>
        {/* 1. Customer / Job title — primary focus */}
        <div>
          <h3 className={dense ? "text-sm font-semibold text-slate-900" : "text-base font-semibold text-slate-900 leading-tight"}>
            {job.services_performed || job.title || "Untitled Job"}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">{customer?.full_name || "—"}</p>
        </div>

        {/* 2. Date / schedule — clear and scannable */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <span className="font-medium text-slate-700">{formatDate(job.service_date)}</span>
          {scheduleRequest && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-blue-600">
                Requested: {scheduleRequest.requested_date ? formatDate(scheduleRequest.requested_date) : "—"}
              </span>
            </>
          )}
        </div>

        {/* 3. Status + badges — refined, not bulky */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getStatusVariant(job.status)} className="text-[11px] font-medium px-2 py-0.5 rounded-md">
            {job.status || 'Unknown'}
          </Badge>
          {scheduleRequest && (
            <Badge variant="info" className="text-[11px] font-medium px-2 py-0.5 rounded-md">
              Schedule Request
            </Badge>
          )}
          {jobFlags.length > 0 && (
            <Badge variant={jobFlags.some(f => f.severity === 'high') ? 'danger' : jobFlags.some(f => f.severity === 'medium') ? 'warning' : 'info'} className="text-[11px] font-medium px-2 py-0.5 rounded-md">
              {jobFlags.length} Issue{jobFlags.length !== 1 ? 's' : ''}
            </Badge>
          )}
          <span className="text-xs text-slate-500">{getJobNextStep(job)}</span>
        </div>

        {/* 4. Crew / assignment */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{crewLabel}</span>
          <select
            value={job.assigned_team_id || ""}
            onChange={(e) => onAssignCrew(job.id, e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 disabled:opacity-60"
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
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              title="Open in Schedule for route-aware assignment"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Schedule</span>
            </Link>
          )}
        </div>

        {/* 5. Value / metadata — muted, secondary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span><span className="font-medium text-slate-600">{formatCurrencyFixed(job.job_cost || 0)}</span></span>
          {job.crew_pay != null && (
            <span>Labor <span className="font-medium text-slate-600">{formatCurrencyFixed(job.crew_pay)}</span></span>
          )}
          {feedbackItem ? (
            <span className="inline-flex items-center gap-1">⭐ <span className="font-medium text-slate-600">{feedbackItem.rating}/5</span>{feedbackItem.comment ? ` · ${feedbackItem.comment}` : ''}</span>
          ) : (
            <span className="italic">No feedback</span>
          )}
        </div>

        {/* Primary action — one clear CTA per card */}
        <div>
          {nextAction ? (
            <Button
              variant={nextAction.kind === 'primary' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                if (nextAction.route) navigate(nextAction.route);
                else if (nextAction.key === 'schedule_job') onEdit(job);
                else if (nextAction.key === 'generate_invoice') onGenerateInvoice(job);
                else if (nextAction.key === 'record_payment') navigate(`/admin/payments?jobId=${job.id}`);
              }}
              className="text-xs font-medium"
            >
              {nextAction.label}
            </Button>
          ) : (
            <Button onClick={() => onEdit(job)} variant="secondary" size="sm" title="Edit job details">
              Edit job
            </Button>
          )}
        </div>

        {/* Job Flags Alert — compact */}
        {jobFlags.length > 0 && (
          <div className={`rounded-lg border ${dense ? 'p-2' : 'p-2.5'} ${
            jobFlags.some(f => f.severity === 'high') ? 'bg-red-50/80 border-red-200' : jobFlags.some(f => f.severity === 'medium') ? 'bg-amber-50/80 border-amber-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <p className="text-xs font-medium text-slate-700 mb-1">Flagged issues</p>
            <div className="space-y-1">
              {jobFlags.map((flag) => (
                <div key={flag.id}>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded ${
                    flag.severity === 'high' ? 'bg-red-100 text-red-800' : flag.severity === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {flag.severity}
                  </span>
                  <span className="text-xs text-slate-600 ml-1">{flag.category}</span>
                  <p className="text-xs text-slate-600 mt-0.5">{flag.message}</p>
                  {flag.created_at && <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(flag.created_at)}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Actions — hierarchy: job actions | billing (soft group) | overflow utility */}
        <div className={`pt-3 border-t border-slate-100 ${dense ? 'pt-2' : ''}`}>
          <div className="flex flex-wrap items-start gap-4 sm:gap-5">
            {/* Job actions — quiet, secondary */}
            <div className="flex flex-wrap items-center gap-1">
              {nextAction && (
                <Button onClick={() => onEdit(job)} variant="tertiary" size="sm" title="Edit job details" className="text-slate-500 hover:text-slate-700 text-xs font-medium">
                  Edit
                </Button>
              )}
              <Button onClick={() => onDelete(job.id)} variant="tertiary" size="sm" title="Delete this job" className="text-slate-500 hover:text-red-600 text-xs font-medium">
                Delete
              </Button>
            </div>

            {/* Billing / documents — light grouped panel (no heavy cluster) */}
            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/50 px-2.5 py-2">
              <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Billing</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {job.customer_id && (
                  <Button
                    onClick={() => navigate(`/admin/quotes/new?customer_id=${job.customer_id}`)}
                    variant="tertiary"
                    size="sm"
                    title="Create a quote for this customer"
                    className="flex items-center gap-1 text-slate-600 hover:text-slate-800 text-xs"
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
                  supportMode={supportMode}
                  billingDisabled={billingDisabled}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Overflow — utility-level, low prominence */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showMore ? "▼ Less" : "▶ More actions"}
          </button>
          {showMore && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => onAddToCalendar(job, customer)}
                className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
                title="Add to calendar (downloads .ics file)"
              >
                Add to calendar
              </button>
              <button
                type="button"
                onClick={() => onGoogleCalendar(job, customer)}
                className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
                title="Add to Google Calendar (opens in browser)"
              >
                Google Calendar
              </button>
              <button
                type="button"
                onClick={() => onEmailCustomer(job, customer)}
                disabled={emailDisabled}
                className={`text-xs ${emailDisabled ? 'text-slate-400 cursor-not-allowed' : 'text-slate-500 hover:text-slate-700 hover:underline'}`}
                title={emailDisabled ? emailReason : `Email ${customerLabel.toLowerCase()}`}
              >
                Email {customerLabel}
              </button>
            </div>
          )}
          {showMore && emailDisabled && <p className="text-xs text-amber-600 mt-1 sm:hidden">{emailReason}</p>}
        </div>
      </div>
    </div>
  );
}

