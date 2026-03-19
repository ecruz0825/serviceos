import { useMemo } from 'react';
import { parseISO, format } from 'date-fns';

export default function CalendarMonth({
  currentMonth,
  jobsByDate,
  customersById,
  onDayClick,
  onJobPillClick,
  highlightJobId = null,
  scheduleRequestByJobId = {},
}) {
  // Helper: Get first day of month
  const startOfMonth = (date) => {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Helper: Get last day of month
  const endOfMonth = (date) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  // Helper: Format date key YYYY-MM-DD
  const formatDateKey = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Get grid days (42 days: 6 weeks)
  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    // Start from Sunday of the week containing month start
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay());
    
    const days = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push(date);
    }
    
    return days;
  }, [currentMonth]);

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const isCurrentMonth = (date) => {
    return date.getMonth() === currentMonth.getMonth() && 
           date.getFullYear() === currentMonth.getFullYear();
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const getStatusColor = (status) => {
    // Subtle, less saturated colors
    if (status === 'Completed') return 'bg-green-50 text-green-700 border border-green-200';
    if (status === 'In Progress') return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (status === 'Canceled') return 'bg-slate-50 text-slate-600 border border-slate-200';
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  };

  return (
    <div className="w-full">
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-px bg-slate-100 border-b border-slate-200">
        {weekDays.map(day => (
          <div key={day} className="bg-white p-2 text-center text-xs font-medium text-slate-600">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-100 border-l border-r border-slate-200">
        {gridDays.map((date, idx) => {
          const dateKey = formatDateKey(date);
          const dayJobs = jobsByDate[dateKey] || [];
          const inMonth = isCurrentMonth(date);
          const isTodayDate = isToday(date);
          const displayJobs = dayJobs.slice(0, 3);
          const moreCount = dayJobs.length - 3;

          return (
            <div
              key={idx}
              onClick={() => onDayClick(dateKey)}
              className={`
                min-h-[100px] p-2 bg-white cursor-pointer hover:bg-slate-50/50 transition-colors
                ${!inMonth ? 'text-slate-400' : 'text-slate-900'}
                ${isTodayDate ? 'ring-1 ring-blue-400 ring-inset bg-blue-50/30' : ''}
              `}
            >
              <div className={`text-xs font-medium mb-1.5 ${isTodayDate ? 'text-blue-600 font-semibold' : 'text-slate-700'}`}>
                {date.getDate()}
                {dayJobs.length > 0 && (
                  <span className="ml-1 text-slate-500 font-normal">
                    • {dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {displayJobs.map((job, jobIdx) => {
                  const customer = customersById[job.customer_id];
                  const title = job.services_performed || 'Untitled';
                  const truncatedTitle = title.length > 15 ? title.substring(0, 15) + '...' : title;
                  const isHighlighted = highlightJobId && String(job.id) === String(highlightJobId);
                  const requestedDate = scheduleRequestByJobId[job.id];
                  const formattedRequestDate = requestedDate ? format(parseISO(requestedDate), 'MMM d') : null;
                  const customerName = customer?.full_name || '—';
                  const truncatedCustomer = customerName.length > 12 ? customerName.substring(0, 12) + '...' : customerName;
                  
                  return (
                    <div
                      key={job.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onJobPillClick(dateKey, job.id);
                      }}
                      className={`
                        text-[10px] px-1.5 py-1 rounded truncate
                        ${getStatusColor(job.status)}
                        ${isHighlighted ? 'ring-2 ring-blue-500 ring-offset-1 shadow-lg z-10' : ''}
                        cursor-pointer hover:opacity-90 transition-all
                      `}
                      title={`${title} - ${customerName}${job.job_cost ? ` - $${job.job_cost.toFixed(2)}` : ''}`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate font-medium">{truncatedTitle}</span>
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5 truncate">
                        {truncatedCustomer}
                      </div>
                      {formattedRequestDate && (
                        <div className="text-[9px] text-slate-500 mt-0.5 italic">
                          Req: {formattedRequestDate}
                        </div>
                      )}
                    </div>
                  );
                })}
                {moreCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayClick(dateKey);
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors font-medium"
                  >
                    +{moreCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

