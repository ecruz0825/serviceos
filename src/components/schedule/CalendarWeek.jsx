import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { parseISO, format } from 'date-fns';

export default function CalendarWeek({
  jobs,
  weekStart,
  onDayClick,
  onJobOpen,
  onJobDateChange,
  onJobResizeStart = () => {},
  onJobResizeEnd = () => {},
  onCreateJob,
  highlightJobId = null,
  scheduleRequestByJobId = {},
}) {
  // Local handler variables guaranteed to be functions
  const resizeStartHandler = onJobResizeStart || (() => {});
  const resizeEndHandler = onJobResizeEnd || (() => {});

  const [draggedJob, setDraggedJob] = useState(null);
  const [activeDragJobId, setActiveDragJobId] = useState(null);
  const [isResizeDrag, setIsResizeDrag] = useState(false);
  const [draggedJobPositions, setDraggedJobPositions] = useState({}); // { dateKey: index }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  // Helper: Format date key YYYY-MM-DD
  const formatDateKey = (date) => {
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
  };

  // Get the 7 days of the week (Sunday to Saturday)
  const weekDays = useMemo(() => {
    const days = [];
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push(date);
    }
    
    return days;
  }, [weekStart]);

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const getStatusColor = (status) => {
    // Match CalendarMonth colors
    if (status === 'Completed') return 'bg-green-50 text-green-700 border border-green-200';
    if (status === 'In Progress') return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (status === 'Canceled') return 'bg-slate-50 text-slate-600 border border-slate-200';
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  };

  // Helper: Parse job start/end dates
  const getJobSpan = (job) => {
    if (!job.service_date) return null;
    const start = formatDateKey(job.service_date);
    const end = job.scheduled_end_date ? formatDateKey(job.scheduled_end_date) : start;
    return { start, end };
  };

  // Helper: Check if a job is on a given day (date-only comparison)
  const isJobOnDay = (job, dayKey) => {
    const span = getJobSpan(job);
    if (!span) return false;
    return dayKey >= span.start && dayKey <= span.end;
  };

  // Helper: Compute segment type for a job on a given day
  const getSegmentType = (job, dayKey) => {
    const span = getJobSpan(job);
    if (!span) return 'single';
    if (span.start === span.end) return 'single';
    if (dayKey === span.start) return 'start';
    if (dayKey === span.end) return 'end';
    return 'middle';
  };

  // Build jobsByDay structure: for each day, include all jobs whose span includes that day
  const jobsByDay = useMemo(() => {
    const map = {};
    if (!jobs || !jobs.length) return map;

    // Initialize map for all days in the week
    weekDays.forEach(date => {
      const dateKey = formatDateKey(date);
      map[dateKey] = [];
    });

    // For each job, add it to all days in its span
    jobs.forEach(job => {
      const span = getJobSpan(job);
      if (!span) return;

      // Find all days in the week that are within the job's span
      weekDays.forEach(date => {
        const dayKey = formatDateKey(date);
        if (isJobOnDay(job, dayKey)) {
          if (!map[dayKey]) {
            map[dayKey] = [];
          }
          // Attach segmentType to the job for this day
          map[dayKey].push({
            ...job,
            __segmentType: getSegmentType(job, dayKey),
          });
        }
      });
    });

    // Sort jobs within each day with stable sorting
    // If a job is being dragged, keep it at its stored position
    Object.keys(map).forEach(dateKey => {
      const dayJobs = map[dateKey];
      
      // If there's an active drag and we have a stored position for this day, preserve it
      if (activeDragJobId && draggedJobPositions[dateKey] !== undefined) {
        const storedIndex = draggedJobPositions[dateKey];
        const draggedJobInDay = dayJobs.find(j => String(j.id) === String(activeDragJobId));
        
        if (draggedJobInDay && storedIndex >= 0 && storedIndex < dayJobs.length) {
          // Create array with original indices for stable sort
          const withIndices = dayJobs.map((job, idx) => ({ job, originalIndex: idx }));
          
          // Separate dragged job from others
          const dragged = withIndices.find(item => String(item.job.id) === String(activeDragJobId));
          const others = withIndices.filter(item => String(item.job.id) !== String(activeDragJobId));
          
          // Sort others by: assignee name, customer name, title, id
          others.sort((a, b) => {
            const assigneeA = (a.job.__assigneeName || '').toLowerCase() || (a.job.assigned_team_id || '').toLowerCase();
            const assigneeB = (b.job.__assigneeName || '').toLowerCase() || (b.job.assigned_team_id || '').toLowerCase();
            if (assigneeA !== assigneeB) return assigneeA.localeCompare(assigneeB);
            
            const customerA = (a.job.__customerName || '').toLowerCase();
            const customerB = (b.job.__customerName || '').toLowerCase();
            if (customerA !== customerB) return customerA.localeCompare(customerB);
            
            const titleA = (a.job.services_performed || '').toLowerCase();
            const titleB = (b.job.services_performed || '').toLowerCase();
            if (titleA !== titleB) return titleA.localeCompare(titleB);
            
            return String(a.job.id).localeCompare(String(b.job.id));
          });
          
          // Reconstruct array with dragged job at its stored position
          const sorted = [];
          let otherIdx = 0;
          for (let i = 0; i < dayJobs.length; i++) {
            if (i === storedIndex) {
              sorted.push(dragged.job);
            } else {
              sorted.push(others[otherIdx++].job);
            }
          }
          map[dateKey] = sorted;
        } else {
          // Dragged job not found or invalid position, sort normally
          const withIndices = dayJobs.map((job, idx) => ({ job, originalIndex: idx }));
          withIndices.sort((a, b) => {
            const assigneeA = (a.job.__assigneeName || '').toLowerCase() || (a.job.assigned_team_id || '').toLowerCase();
            const assigneeB = (b.job.__assigneeName || '').toLowerCase() || (b.job.assigned_team_id || '').toLowerCase();
            if (assigneeA !== assigneeB) return assigneeA.localeCompare(assigneeB);
            
            const customerA = (a.job.__customerName || '').toLowerCase();
            const customerB = (b.job.__customerName || '').toLowerCase();
            if (customerA !== customerB) return customerA.localeCompare(customerB);
            
            const titleA = (a.job.services_performed || '').toLowerCase();
            const titleB = (b.job.services_performed || '').toLowerCase();
            if (titleA !== titleB) return titleA.localeCompare(titleB);
            
            return String(a.job.id).localeCompare(String(b.job.id));
          });
          map[dateKey] = withIndices.map(item => item.job);
        }
      } else {
        // No active drag, sort normally with stable sort
        const withIndices = dayJobs.map((job, idx) => ({ job, originalIndex: idx }));
        withIndices.sort((a, b) => {
          const assigneeA = (a.job.__assigneeName || '').toLowerCase() || (a.job.assigned_team_id || '').toLowerCase();
          const assigneeB = (b.job.__assigneeName || '').toLowerCase() || (b.job.assigned_team_id || '').toLowerCase();
          if (assigneeA !== assigneeB) return assigneeA.localeCompare(assigneeB);
          
          const customerA = (a.job.__customerName || '').toLowerCase();
          const customerB = (b.job.__customerName || '').toLowerCase();
          if (customerA !== customerB) return customerA.localeCompare(customerB);
          
          const titleA = (a.job.services_performed || '').toLowerCase();
          const titleB = (b.job.services_performed || '').toLowerCase();
          if (titleA !== titleB) return titleA.localeCompare(titleB);
          
          return String(a.job.id).localeCompare(String(b.job.id));
        });
        map[dateKey] = withIndices.map(item => item.job);
      }
    });

    return map;
  }, [jobs, weekDays, activeDragJobId, draggedJobPositions]);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handleDragStart = (event) => {
    const { active } = event;
    const dragType = active.data.current?.dragType || 'move';
    
    // For resize drags, extract job ID from the drag ID
    let jobId = String(active.id);
    if (dragType === 'resize-start') {
      jobId = jobId.replace('resize-start-', '');
      setIsResizeDrag(true);
    } else if (dragType === 'resize-end') {
      jobId = jobId.replace('resize-end-', '');
      setIsResizeDrag(true);
    } else {
      setIsResizeDrag(false);
    }
    
    // Find the job being dragged
    const job = jobs.find(j => String(j.id) === jobId);
    setDraggedJob(job);
    setActiveDragJobId(jobId);
    
    // Store the current position of the dragged job in each day
    // We need to compute jobsByDay temporarily to get current positions (sorted)
    const tempMap = {};
    weekDays.forEach(date => {
      const dateKey = formatDateKey(date);
      tempMap[dateKey] = [];
    });
    
    jobs.forEach(j => {
      const span = getJobSpan(j);
      if (!span) return;
      weekDays.forEach(date => {
        const dayKey = formatDateKey(date);
        if (isJobOnDay(j, dayKey)) {
          tempMap[dayKey].push({
            ...j,
            __segmentType: getSegmentType(j, dayKey),
          });
        }
      });
    });
    
    // Sort each day's jobs using the same stable sort logic
    Object.keys(tempMap).forEach(dateKey => {
      const dayJobs = tempMap[dateKey];
      const withIndices = dayJobs.map((job, idx) => ({ job, originalIndex: idx }));
      withIndices.sort((a, b) => {
        const assigneeA = (a.job.__assigneeName || '').toLowerCase() || (a.job.assigned_team_id || '').toLowerCase();
        const assigneeB = (b.job.__assigneeName || '').toLowerCase() || (b.job.assigned_team_id || '').toLowerCase();
        if (assigneeA !== assigneeB) return assigneeA.localeCompare(assigneeB);
        
        const customerA = (a.job.__customerName || '').toLowerCase();
        const customerB = (b.job.__customerName || '').toLowerCase();
        if (customerA !== customerB) return customerA.localeCompare(customerB);
        
        const titleA = (a.job.services_performed || '').toLowerCase();
        const titleB = (b.job.services_performed || '').toLowerCase();
        if (titleA !== titleB) return titleA.localeCompare(titleB);
        
        return String(a.job.id).localeCompare(String(b.job.id));
      });
      tempMap[dateKey] = withIndices.map(item => item.job);
    });
    
    // Find positions of dragged job in each day (after sorting)
    const positions = {};
    Object.keys(tempMap).forEach(dateKey => {
      const index = tempMap[dateKey].findIndex(j => String(j.id) === String(jobId));
      if (index >= 0) {
        positions[dateKey] = index;
      }
    });
    setDraggedJobPositions(positions);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setDraggedJob(null);
    setActiveDragJobId(null);
    setIsResizeDrag(false);
    setDraggedJobPositions({});

    if (!over) return;

    const overId = String(over.id);
    const dragType = active.data.current?.dragType || 'move';

    // Check if dropped on a day droppable
    if (!overId.startsWith('day-')) return;

    // Extract date from droppable ID (format: day-YYYY-MM-DD)
    const targetDate = overId.replace('day-', '');
    
    // Extract job ID from active.id (handles resize-start-{id} and resize-end-{id} formats)
    let jobId = String(active.id);
    if (dragType === 'resize-start') {
      jobId = jobId.replace('resize-start-', '');
    } else if (dragType === 'resize-end') {
      jobId = jobId.replace('resize-end-', '');
    }
    
    // Find the job
    const job = jobs.find(j => String(j.id) === jobId);
    if (!job) return;

    // Handle different drag types
    if (dragType === 'resize-start') {
      const currentStart = job.service_date ? formatDateKey(job.service_date) : null;
      if (currentStart === targetDate) return;
      resizeStartHandler(jobId, targetDate);
    } else if (dragType === 'resize-end') {
      const currentEnd = job.scheduled_end_date ? formatDateKey(job.scheduled_end_date) : formatDateKey(job.service_date);
      if (currentEnd === targetDate) return;
      resizeEndHandler(jobId, targetDate);
    } else {
      // Default: move (existing behavior)
      if (!onJobDateChange) return;
      const currentDate = job.service_date ? formatDateKey(job.service_date) : null;
      if (currentDate === targetDate) return;
      onJobDateChange(jobId, targetDate);
    }
  };

  const handleDragCancel = () => {
    setDraggedJob(null);
    setActiveDragJobId(null);
    setIsResizeDrag(false);
    setDraggedJobPositions({});
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="w-full">
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-px bg-slate-100 border-b border-slate-200">
        {weekDays.map((date, idx) => {
          const dateKey = formatDateKey(date);
          const dayJobs = jobsByDay[dateKey] || [];
          const jobCount = dayJobs.length;
          const dayName = dayNames[date.getDay()];
          
          return (
            <div key={idx} className="bg-white p-2 text-center text-xs font-medium text-slate-600">
              {dayName} {date.getDate()}
              {jobCount > 0 && (
                <span className="ml-1 text-slate-500 font-normal">
                  • {jobCount} {jobCount === 1 ? 'job' : 'jobs'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Week columns */}
      <div className="grid grid-cols-7 gap-px bg-slate-100 border-l border-r border-slate-200">
        {weekDays.map((date, idx) => {
          const dateKey = formatDateKey(date);
          const dayJobs = jobsByDay[dateKey] || [];
          const isTodayDate = isToday(date);
          const displayJobs = dayJobs.slice(0, 6);
          const moreCount = dayJobs.length - 6;
          const dayName = dayNames[date.getDay()];
          const droppableId = `day-${dateKey}`;
          const jobCount = dayJobs.length;

          return (
            <DroppableDay
              key={idx}
              id={droppableId}
              date={date}
              dayName={dayName}
              isTodayDate={isTodayDate}
              displayJobs={displayJobs}
              moreCount={moreCount}
              jobCount={jobCount}
              dateKey={dateKey}
              onDayClick={onDayClick}
              onJobOpen={onJobOpen}
              onJobResizeStart={resizeStartHandler}
              onJobResizeEnd={resizeEndHandler}
              onCreateJob={onCreateJob}
              getStatusColor={getStatusColor}
              highlightJobId={highlightJobId}
              scheduleRequestByJobId={scheduleRequestByJobId}
            />
          );
        })}
      </div>

      </div>

      <DragOverlay>
        {draggedJob ? (
          <JobPill
            job={draggedJob}
            getStatusColor={getStatusColor}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Draggable Job Pill Component
function DraggableJob({ job, getStatusColor, onJobOpen, dateKey, onDayClick, segmentType = 'single', onJobResizeStart = () => {}, onJobResizeEnd = () => {}, highlightJobId = null, scheduleRequestByJobId = {} }) {
  const [isHovered, setIsHovered] = useState(false);
  
  // Main drag (move) - for center area
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(job.id),
    data: {
      job,
      currentDate: dateKey,
      dragType: 'move',
    },
  });

  // Resize start (left handle)
  const { 
    attributes: resizeStartAttrs, 
    listeners: resizeStartListeners, 
    setNodeRef: setResizeStartRef 
  } = useDraggable({
    id: `resize-start-${job.id}`,
    data: {
      job,
      direction: "start",
      dragType: "resize-start",
    },
  });

  // Resize end (right handle)
  const { 
    attributes: resizeEndAttrs, 
    listeners: resizeEndListeners, 
    setNodeRef: setResizeEndRef 
  } = useDraggable({
    id: `resize-end-${job.id}`,
    data: {
      job,
      direction: "end",
      dragType: "resize-end",
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const title = job.services_performed || 'Untitled';
  const truncatedTitle = title.length > 18 ? title.substring(0, 18) + '...' : title;
  const customerName = job.__customerName || '';
  const assigneeName = job.__assigneeName || 'Unassigned';
  const isAssigned = !!job.assigned_team_id;
  const isHighlighted = highlightJobId && job.id === highlightJobId;
  const requestedDate = scheduleRequestByJobId[job.id];
  const formattedRequestDate = requestedDate ? format(parseISO(requestedDate), 'MMM d') : null;

  // Get border radius classes based on segmentType
  const getBorderRadius = (type) => {
    switch (type) {
      case 'single':
        return 'rounded-lg';
      case 'start':
        return 'rounded-l-lg rounded-r-none';
      case 'end':
        return 'rounded-r-lg rounded-l-none';
      case 'middle':
        return 'rounded-none';
      default:
        return 'rounded-lg';
    }
  };

  // Get border classes to remove seams between segments
  const getBorderClasses = (type) => {
    switch (type) {
      case 'single':
        return ''; // Full border for single-day jobs
      case 'start':
        return 'border-r-0'; // Remove right border to connect with middle/end
      case 'middle':
        return 'border-l-0 border-r-0 -ml-px'; // Remove both borders, overlap by 1px
      case 'end':
        return 'border-l-0 -ml-px'; // Remove left border, overlap by 1px
      default:
        return '';
    }
  };

  // Show left handle only for start or single segments
  const showLeftHandle = (segmentType === 'start' || segmentType === 'single') && isHovered;
  // Show right handle only for end or single segments
  const showRightHandle = (segmentType === 'end' || segmentType === 'single') && isHovered;

  // Handle click - only fire if not dragging (activationConstraint should prevent drag on simple clicks)
  const handleClick = (e) => {
    // If dragging, don't handle click
    if (isDragging || transform) return;
    
    e.stopPropagation();
    if (onJobOpen) {
      onJobOpen(job.id);
    } else if (onDayClick) {
      onDayClick(dateKey);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative text-[11px] px-2 py-1.5 rounded-lg shadow-sm border border-slate-200/80
        ${getBorderRadius(segmentType)}
        ${getStatusColor(job.status)} ${getBorderClasses(segmentType)}
        ${isDragging ? 'cursor-grabbing ring-2 ring-blue-400 shadow-xl opacity-50' : 'cursor-grab'}
        ${isHovered && !isDragging ? 'ring-1 ring-slate-300 shadow-md' : ''}
        ${isHighlighted && !isDragging ? 'ring-2 ring-blue-500 ring-offset-1 shadow-lg z-10' : ''}
        transition-all
      `}
      title={`${title}${customerName ? ` - ${customerName}` : ''}`}
    >
      {/* Left resize handle */}
      {showLeftHandle && (
        <div
          ref={setResizeStartRef}
          {...resizeStartAttrs}
          {...resizeStartListeners}
          className={`absolute left-0 top-0 bottom-0 w-[8px] z-10 transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ 
            cursor: 'ew-resize',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Main content area (existing drag region) */}
      <div
        {...listeners}
        {...attributes}
        onClick={handleClick}
        className="relative z-0"
      >
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{truncatedTitle}</div>
            {customerName && (
              <div className="text-[10px] text-slate-600 truncate mt-0.5">{customerName}</div>
            )}
            {job.job_cost && (
              <div className="text-[9px] text-slate-600 mt-0.5 font-medium">
                ${job.job_cost.toFixed(2)}
              </div>
            )}
            {formattedRequestDate && (
              <div className="text-[9px] text-slate-500 italic mt-0.5">
                Req: {formattedRequestDate}
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            <span className={`
              inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium
              ${isAssigned ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'}
            `}>
              {assigneeName.length > 8 ? assigneeName.substring(0, 8) + '...' : assigneeName}
            </span>
          </div>
        </div>
      </div>

      {/* Right resize handle */}
      {showRightHandle && (
        <div
          ref={setResizeEndRef}
          {...resizeEndAttrs}
          {...resizeEndListeners}
          className={`absolute right-0 top-0 bottom-0 w-[8px] z-10 transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ 
            cursor: 'ew-resize',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

// Droppable Day Column Component
function DroppableDay({
  id,
  date,
  dayName,
  isTodayDate,
  displayJobs,
  moreCount,
  jobCount,
  dateKey,
  onDayClick,
  onJobOpen,
  onJobResizeStart,
  onJobResizeEnd,
  onCreateJob,
  getStatusColor,
  highlightJobId = null,
  scheduleRequestByJobId = {},
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  const handleCreateClick = (e) => {
    e.stopPropagation();
    onCreateJob?.(dateKey);
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[350px] p-3 bg-white hover:bg-slate-50/30
        ${isOver ? 'bg-blue-50 ring-1 ring-blue-300' : ''}
        transition-colors
      `}
    >
      {/* Day header */}
      <div className="mb-2 pb-2 border-b border-slate-100">
        <div className="flex items-center justify-between gap-1">
          <div
            onClick={() => onDayClick?.(dateKey)}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity flex-1 min-w-0"
          >
            <span className={`text-sm font-semibold ${isTodayDate ? 'text-blue-600' : 'text-slate-900'}`}>
              {dayName}
            </span>
            <span className={`text-base font-semibold ${isTodayDate ? 'text-blue-600' : 'text-slate-900'}`}>
              {date.getDate()}
            </span>
            {jobCount > 0 && (
              <span className={`text-xs text-slate-500 font-normal ${isTodayDate ? 'text-blue-500' : ''}`}>
                • {jobCount} {jobCount === 1 ? 'job' : 'jobs'}
              </span>
            )}
            {isTodayDate && (
              <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                Today
              </span>
            )}
          </div>
          <button
            onClick={handleCreateClick}
            className="flex-shrink-0 p-1 rounded hover:bg-slate-200 transition-colors text-slate-600 hover:text-slate-900"
            title="Create job for this day"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Job pills */}
      <div className="space-y-1">
        {displayJobs.map((job) => (
          <DraggableJob
            key={job.id}
            job={job}
            getStatusColor={getStatusColor}
            onJobOpen={onJobOpen}
            dateKey={dateKey}
            onDayClick={onDayClick}
            segmentType={job.__segmentType || 'single'}
            onJobResizeStart={onJobResizeStart || (() => {})}
            onJobResizeEnd={onJobResizeEnd || (() => {})}
            highlightJobId={highlightJobId}
            scheduleRequestByJobId={scheduleRequestByJobId}
          />
        ))}
        {moreCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDayClick?.(dateKey);
            }}
            className="text-[11px] px-2 py-1.5 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors font-medium w-full"
          >
            +{moreCount} more
          </button>
        )}
      </div>
    </div>
  );
}

// Job Pill for DragOverlay
function JobPill({ job, getStatusColor, segmentType = 'single' }) {
  const title = job.services_performed || 'Untitled';
  const truncatedTitle = title.length > 18 ? title.substring(0, 18) + '...' : title;
  const customerName = job.__customerName || '';
  const assigneeName = job.__assigneeName || 'Unassigned';
  const isAssigned = !!job.assigned_team_id;

  // Get border radius classes based on segmentType
  const getBorderRadius = (type) => {
    switch (type) {
      case 'single':
        return 'rounded';
      case 'start':
        return 'rounded-l';
      case 'end':
        return 'rounded-r';
      case 'middle':
        return 'rounded-none';
      default:
        return 'rounded';
    }
  };

  return (
    <div
      className={`
        text-[11px] px-2 py-1.5 ${getBorderRadius(segmentType)}
        ${getStatusColor(job.status)}
        ring-2 ring-blue-400 shadow-xl opacity-90 scale-95
        w-[140px]
      `}
      title={`${title}${customerName ? ` - ${customerName}` : ''}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{truncatedTitle}</div>
          {customerName && (
            <div className="text-[10px] text-slate-600 truncate mt-0.5">{customerName}</div>
          )}
          {job.job_cost && (
            <div className="text-[9px] text-slate-600 mt-0.5 font-medium">
              ${job.job_cost.toFixed(2)}
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <span className={`
            inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium
            ${isAssigned ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'}
          `}>
            {assigneeName.length > 8 ? assigneeName.substring(0, 8) + '...' : assigneeName}
          </span>
        </div>
      </div>
    </div>
  );
}

