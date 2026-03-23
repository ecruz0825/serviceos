import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../supabaseClient';
import useCompanySettings from '../../hooks/useCompanySettings';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ScheduleJobRow from '../../components/schedule/ScheduleJobRow';
import CalendarMonth from '../../components/schedule/CalendarMonth';
import CalendarWeek from '../../components/schedule/CalendarWeek';
import DayJobsDrawer from '../../components/schedule/DayJobsDrawer';
import ScheduleRequestsTab from '../../components/schedule/ScheduleRequestsTab';
import ScheduleNeedsSchedulingTab from '../../components/schedule/ScheduleNeedsSchedulingTab';
import toast from 'react-hot-toast';

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Helper component: Draggable job row for Crew View
function CrewJobRow({ job, customersById, teams, teamMembers, scheduleRequestByJobId, onOpenJob, onAssignCrew, reassigningJobs, activeDragJobId, crewColor, isUnassigned }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(job.id),
    disabled: !!reassigningJobs[job.id],
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const customer = customersById[job.customer_id];
  const serviceDate = job.service_date 
    ? new Date(job.service_date).toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      })
    : null;

  const isActiveDrag = activeDragJobId === String(job.id);

  const combinedStyle = {
    ...style,
    ...(crewColor && !isUnassigned ? {
      borderLeft: `3px solid ${crewColor}`,
      paddingLeft: '0.625rem',
      marginLeft: '-0.625rem'
    } : {})
  };

  return (
    <div
      ref={setNodeRef}
      style={combinedStyle}
      {...listeners}
      {...attributes}
      onClick={() => onOpenJob(job)}
      className={`flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0 transition-colors cursor-move rounded-md ${
        isDragging || isActiveDrag
          ? 'opacity-50'
          : isUnassigned 
            ? 'hover:bg-slate-50/50' 
            : crewColor 
              ? 'hover:bg-slate-50/30' 
              : 'hover:bg-slate-50/50'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-medium text-slate-900">
            {job.services_performed || "Untitled Job"}
          </h4>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            job.status === "Completed" ? "bg-green-100 text-green-800" :
            job.status === "In Progress" ? "bg-blue-100 text-blue-800" :
            job.status === "Canceled" ? "bg-slate-200 text-slate-700" :
            "bg-amber-100 text-amber-800"
          }`}>
            {job.status}
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-0.5">
          {customer?.full_name || "—"}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
          {serviceDate && <span>{serviceDate}</span>}
          {job.job_cost && (
            <>
              {serviceDate && <span className="text-slate-300">•</span>}
              <span>${job.job_cost.toFixed(2)}</span>
            </>
          )}
        </div>
        {scheduleRequestByJobId[job.id] && (
          <div className="text-xs text-slate-500 italic mt-1">
            Requested: {new Date(scheduleRequestByJobId[job.id]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <select
          value={job.assigned_team_id || ""}
          onChange={(e) => {
            e.stopPropagation();
            onAssignCrew(job.id, e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={reassigningJobs[job.id]}
          className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">Unassigned</option>
          {teams.map((team) => {
            const memberCount = teamMembers.filter(tm => tm.team_id === team.id).length;
            const displayName = memberCount === 1 
              ? (teamMembers.find(tm => tm.team_id === team.id)?.crew_members?.full_name || team.name)
              : team.name;
            return (
              <option key={team.id} value={team.id}>
                {displayName}
              </option>
            );
          })}
        </select>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onOpenJob(job);
          }}
          variant="tertiary"
          className="text-xs"
        >
          Open
        </Button>
      </div>
    </div>
  );
}

// Helper component: Drop zone for a crew section
function CrewDropZone({ crewId, crewName, memberCount, crewColor, isUnassigned, crewJobs, customersById, teams, teamMembers, scheduleRequestByJobId, onOpenJob, onAssignCrew, reassigningJobs, activeDragJobId }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `crew-drop-${crewId}`,
  });

  return (
    <div 
      ref={setNodeRef}
      key={crewId} 
      className={`border-b last:border-b-0 pb-6 last:pb-0 transition-colors ${
        isOver ? 'bg-slate-50/50' : ''
      } ${
        isUnassigned ? 'border-slate-200' : 'border-slate-200'
      }`}
    >
      <div 
        className={`mb-3 pb-2 border-b ${
          isUnassigned 
            ? 'border-slate-200' 
            : crewColor 
              ? 'border-slate-200' 
              : 'border-slate-200'
        }`}
        style={crewColor && !isUnassigned ? {
          borderLeftWidth: '4px',
          borderLeftStyle: 'solid',
          borderLeftColor: crewColor,
          paddingLeft: '0.75rem',
          marginLeft: '-0.75rem'
        } : {}}
      >
        <div className="flex items-center gap-2">
          {crewColor && !isUnassigned && (
            <div 
              className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-white shadow-sm"
              style={{ backgroundColor: crewColor }}
              title={`Crew color: ${crewColor}`}
            />
          )}
          {isUnassigned && (
            <div className="w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-sm flex-shrink-0" />
          )}
          <div className="flex-1">
            <h3 className={`text-base font-semibold ${
              isUnassigned ? 'text-slate-600' : 'text-slate-900'
            }`}>
              {crewName}
              {memberCount > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({memberCount} {memberCount === 1 ? 'member' : 'members'})
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {crewJobs.length} {crewJobs.length === 1 ? 'job' : 'jobs'}
            </p>
          </div>
        </div>
      </div>
      <div className={`divide-y divide-slate-100 ${isOver ? 'min-h-[60px]' : ''}`}>
        {crewJobs.length === 0 && isOver ? (
          <div className="py-4 text-center text-sm text-slate-500 italic">
            Drop job here
          </div>
        ) : (
          crewJobs.map(job => (
            <CrewJobRow
              key={job.id}
              job={job}
              customersById={customersById}
              teams={teams}
              teamMembers={teamMembers}
              scheduleRequestByJobId={scheduleRequestByJobId}
              onOpenJob={onOpenJob}
              onAssignCrew={onAssignCrew}
              reassigningJobs={reassigningJobs}
              activeDragJobId={activeDragJobId}
              crewColor={crewColor}
              isUnassigned={isUnassigned}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Helper component: Map Dispatch View
function MapDispatchView({ jobs, customers, teams, teamMembers, getCrewDisplayName, getCrewColor, onOpenJob }) {
  const customersById = useMemo(() => {
    const map = {};
    customers.forEach(c => { map[c.id] = c; });
    return map;
  }, [customers]);

  // Sort jobs by route_order if available, otherwise keep original order
  const sortedJobs = useMemo(() => {
    const jobsWithRoute = jobs.filter(job => job.route_order != null);
    const jobsWithoutRoute = jobs.filter(job => job.route_order == null);
    
    // Sort jobs with route_order
    const sorted = [...jobsWithRoute].sort((a, b) => {
      const orderA = a.route_order ?? Infinity;
      const orderB = b.route_order ?? Infinity;
      return orderA - orderB;
    });
    
    // Append jobs without route_order at the end
    return [...sorted, ...jobsWithoutRoute];
  }, [jobs]);

  // Build route line positions (only for jobs with route_order)
  const routeLinePositions = useMemo(() => {
    const jobsWithRoute = sortedJobs.filter(job => {
      const customer = customersById[job.customer_id];
      return job.route_order != null && customer?.latitude && customer?.longitude;
    });
    
    if (jobsWithRoute.length < 2) return [];
    
    return jobsWithRoute.map(job => {
      const customer = customersById[job.customer_id];
      return [customer.latitude, customer.longitude];
    });
  }, [sortedJobs, customersById]);

  // Check if we have a valid route (at least 2 jobs with route_order)
  const hasRoute = routeLinePositions.length >= 2;

  // Calculate map center from job locations
  const mapCenter = useMemo(() => {
    if (jobs.length === 0) return [39.8283, -98.5795]; // Center of USA

    let totalLat = 0;
    let totalLng = 0;
    let count = 0;

    jobs.forEach(job => {
      const customer = customersById[job.customer_id];
      if (customer?.latitude && customer?.longitude) {
        totalLat += customer.latitude;
        totalLng += customer.longitude;
        count++;
      }
    });

    if (count === 0) return [39.8283, -98.5795];
    return [totalLat / count, totalLng / count];
  }, [jobs, customersById]);

  // Create custom icon for markers based on crew color
  const createMarkerIcon = (color) => {
    const iconColor = color || '#6b7280'; // Default to slate-500 for unassigned
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${iconColor}; width: 24px; height: 24px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24],
    });
  };

  if (jobs.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-slate-600 mb-2">No mappable job locations available for this selection.</p>
        <p className="text-sm text-slate-500">
          Jobs need valid customer location data (latitude/longitude) to appear on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full relative" style={{ height: '600px' }}>
      {/* Route status indicator */}
      {hasRoute && (
        <div className="absolute top-4 right-4 z-[1000] bg-white border border-slate-300 rounded-md px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-xs font-medium text-slate-700">Showing planned route</span>
          </div>
        </div>
      )}
      {!hasRoute && jobs.length >= 2 && (
        <div className="absolute top-4 right-4 z-[1000] bg-white border border-slate-300 rounded-md px-3 py-2 shadow-sm">
          <span className="text-xs text-slate-500">No planned route available</span>
        </div>
      )}
      <MapContainer
        center={mapCenter}
        zoom={jobs.length === 1 ? 13 : 10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Route line */}
        {hasRoute && (
          <Polyline
            positions={routeLinePositions}
            pathOptions={{
              color: '#3b82f6',
              weight: 3,
              opacity: 0.7,
              dashArray: '5, 5'
            }}
          />
        )}
        {sortedJobs.map(job => {
          const customer = customersById[job.customer_id];
          if (!customer?.latitude || !customer?.longitude) return null;

          const crewId = job.assigned_team_id || 'unassigned';
          const crewColor = getCrewColor(crewId);
          const crewName = getCrewDisplayName(crewId);
          const serviceDate = job.service_date 
            ? new Date(job.service_date).toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              })
            : null;

          return (
            <Marker
              key={job.id}
              position={[customer.latitude, customer.longitude]}
              icon={createMarkerIcon(crewColor)}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-semibold text-slate-900 mb-1">
                    {job.services_performed || "Untitled Job"}
                  </h3>
                  <p className="text-sm text-slate-600 mb-2">
                    {customer?.full_name || "—"}
                  </p>
                  <div className="space-y-1 text-xs text-slate-500 mb-3">
                    {serviceDate && <div>Date: {serviceDate}</div>}
                    <div>Crew: {crewName}</div>
                    {job.job_cost && <div>Cost: ${job.job_cost.toFixed(2)}</div>}
                    <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      job.status === "Completed" ? "bg-green-100 text-green-800" :
                      job.status === "In Progress" ? "bg-blue-100 text-blue-800" :
                      job.status === "Canceled" ? "bg-slate-200 text-slate-700" :
                      "bg-amber-100 text-amber-800"
                    }`}>
                      {job.status}
                    </div>
                  </div>
                  {customer?.address && (
                    <p className="text-xs text-slate-500 mb-3">{customer.address}</p>
                  )}
                  <Button
                    onClick={() => onOpenJob(job)}
                    variant="secondary"
                    className="w-full text-xs"
                  >
                    Open Job
                  </Button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

// Helper component: Drag preview overlay
function CrewJobDragPreview({ job, customersById }) {
  const customer = customersById[job.customer_id];
  return (
    <div className="bg-white border border-slate-300 rounded-md shadow-lg p-3 max-w-xs">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-slate-900">
          {job.services_performed || "Untitled Job"}
        </h4>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          job.status === "Completed" ? "bg-green-100 text-green-800" :
          job.status === "In Progress" ? "bg-blue-100 text-blue-800" :
          job.status === "Canceled" ? "bg-slate-200 text-slate-700" :
          "bg-amber-100 text-amber-800"
        }`}>
          {job.status}
        </span>
      </div>
      <p className="text-xs text-slate-600 mt-1">
        {customer?.full_name || "—"}
      </p>
    </div>
  );
}

export default function ScheduleAdmin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useCompanySettings();
  const crewLabel = settings?.crew_label || "Crew";
  const customerLabel = settings?.customer_label || "Customer";

  // Get active tab from query params (default to 'schedule')
  // Use 'scheduleTab' to avoid conflict with Operations Center's 'tab' param
  const activeTab = useMemo(() => {
    const tab = searchParams.get('scheduleTab');
    return tab === 'requests' || tab === 'needs-scheduling' ? tab : 'schedule';
  }, [searchParams]);

  // Get jobId from query params (for deep linking)
  const jobIdParam = useMemo(() => {
    return searchParams.get('jobId');
  }, [searchParams]);

  // Handle tab change
  // Use 'scheduleTab' to avoid conflict with Operations Center's 'tab' param
  const handleTabChange = (tab) => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === 'schedule') {
      newParams.delete('scheduleTab');
    } else {
      newParams.set('scheduleTab', tab);
    }
    setSearchParams(newParams, { replace: true });
  };

  const [companyId, setCompanyId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [crewMembers, setCrewMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [scheduleRequests, setScheduleRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadWarnings, setLoadWarnings] = useState([]);
  const [reloadToken, setReloadToken] = useState(0);

  // Date/range state
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split('T')[0];
  });
  const [dateRange, setDateRange] = useState('day'); // 'day' | 'week'
  const [selectedCrew, setSelectedCrew] = useState('');
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [routeOptimizationCrew, setRouteOptimizationCrew] = useState(''); // '' = all crews, or team ID
  const [optimizedRouteLoading, setOptimizedRouteLoading] = useState(false);
  const [optimizedRouteError, setOptimizedRouteError] = useState('');
  const [applyingOptimizedRoute, setApplyingOptimizedRoute] = useState(false);
  const [applyOptimizedRouteResult, setApplyOptimizedRouteResult] = useState(null);
  const [reassigningJobs, setReassigningJobs] = useState({}); // { jobId: true/false }
  
  // Drag-and-drop state for Crew View
  const [draggedJob, setDraggedJob] = useState(null);
  const [activeDragJobId, setActiveDragJobId] = useState(null);
  
  // Sensors for drag-and-drop (same as Week view)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  // View mode: 'agenda' | 'calendar' | 'week' | 'crew'
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('schedule:viewMode');
    return saved === 'calendar' ? 'calendar' : saved === 'week' ? 'week' : saved === 'crew' ? 'crew' : 'agenda';
  });
  
  // Calendar month state
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    today.setDate(1);
    return today;
  });
  
  // Day drawer state
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [highlightJobId, setHighlightJobId] = useState(null);

  // Token ref to prevent stale async updates from race conditions
  const moveTokenByJobIdRef = useRef({});
  
  // Pending reschedules ref: tracks { token, oldDate, newDate } for each job
  const pendingReschedulesRef = useRef({});

  // Initialize company ID
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
      }
    };
    init();
  }, []);

  // Handle deep-link query params (jobId, focusDate)
  // Note: jobIdParam is already defined above from useMemo
  useEffect(() => {
    const focusDateParam = searchParams.get('focusDate');

    // Set focus date if provided (only on schedule tab)
    if (focusDateParam && activeTab === 'schedule') {
      try {
        const focusDate = new Date(focusDateParam);
        if (!isNaN(focusDate.getTime())) {
          setSelectedDate(focusDateParam);
          
          // Set current month to the focus date's month
          const monthDate = new Date(focusDate);
          monthDate.setDate(1);
          setCurrentMonth(monthDate);
          
          // Set view mode to week if not already set (better for focusing on a date)
          if (viewMode === 'agenda') {
            setViewMode('week');
            localStorage.setItem('schedule:viewMode', 'week');
          }
        }
      } catch (e) {
        console.error('Invalid focusDate:', focusDateParam);
      }
    }

    // Set highlight job ID if provided
    if (jobIdParam) {
      // Only set highlight and auto-clear on schedule tab
      if (activeTab === 'schedule') {
        setHighlightJobId(jobIdParam);
        
        // Auto-open drawer if we have a focus date
        if (focusDateParam) {
          setSelectedDayDate(focusDateParam);
          setDayDrawerOpen(true);
        } else {
        // Try to find the job's date from jobs array (will be set after jobs load)
        const job = jobs.find(j => String(j.id) === String(jobIdParam));
        if (job?.service_date) {
          try {
            const jobDate = job.service_date.split('T')[0];
            if (jobDate && jobDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
              setSelectedDayDate(jobDate);
              setDayDrawerOpen(true);
            }
          } catch (e) {
            console.error('Invalid service_date format:', job.service_date);
          }
        } else if (jobIdParam && jobs.length > 0) {
          // Job ID provided but job not found in loaded jobs - may have been deleted
          console.warn('Job not found in schedule:', jobIdParam);
          // Clear invalid jobId param
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('jobId');
          setSearchParams(newParams, { replace: true });
        }
        }

        // Clear highlight after 5 seconds (only on schedule tab)
        const timeoutId = setTimeout(() => {
          setHighlightJobId(null);
          // Clear query params after timeout
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('jobId');
          newParams.delete('focusDate');
          setSearchParams(newParams, { replace: true });
        }, 5000);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [searchParams, jobs, viewMode, setSearchParams, activeTab]);

  // Refresh schedule requests count (extracted for reuse)
  const refreshScheduleRequestsCount = useCallback(async () => {
    if (!companyId || !jobs || jobs.length === 0) {
      setScheduleRequests([]);
      return;
    }

    const jobIds = jobs.map(j => j.id);
    const { data: requestsData, error: requestsError } = await supabase
      .from('job_schedule_requests')
      .select('job_id, requested_date, created_at')
      .eq('status', 'requested')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false });

    if (requestsError) {
      console.error('Error fetching schedule requests:', requestsError);
    } else {
      setScheduleRequests(requestsData || []);
    }
  }, [companyId, jobs]);

  // Fetch data
  useEffect(() => {
    if (!companyId) return;

    const fetchData = async () => {
      setLoading(true);
      const warnings = [];

      // Fetch jobs (include route_order for Map View route lines)
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date, route_order')
        .eq('company_id', companyId);

      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
        toast.error('Failed to load jobs');
      } else {
        setJobs(jobsData || []);
      }

      // Fetch customers (include location data for Map view)
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, full_name, email, latitude, longitude, address')
        .eq('company_id', companyId);

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        warnings.push('Customers');
      } else {
        setCustomers(customersData || []);
      }

      // Fetch crew (for fallback)
      const { data: crewData, error: crewError } = await supabase
        .from('crew_members')
        .select('id, full_name')
        .eq('company_id', companyId);

      if (crewError) {
        console.error('Error fetching crew:', crewError);
        warnings.push('Crew');
      } else {
        setCrewMembers(crewData || []);
      }

      // Fetch teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (teamsError) {
        console.error('Error fetching teams:', teamsError);
        warnings.push('Teams');
      } else {
        setTeams(teamsData || []);

        // Fetch team_members if teams exist
        if (teamsData && teamsData.length > 0) {
          const teamIds = teamsData.map(t => t.id);
          const { data: teamMembersData, error: teamMembersError } = await supabase
            .from('team_members')
            .select('*, crew_members(id, full_name)')
            .in('team_id', teamIds);

          if (teamMembersError) {
            console.error('Error fetching team members:', teamMembersError);
            warnings.push('Team members');
          } else {
            setTeamMembers(teamMembersData || []);
          }
        }
      }

      // Fetch schedule requests for jobs
      if (jobsData && jobsData.length > 0) {
        const jobIds = jobsData.map(j => j.id);
        const { data: requestsData, error: requestsError } = await supabase
          .from('job_schedule_requests')
          .select('job_id, requested_date, created_at')
          .eq('status', 'requested')
          .in('job_id', jobIds)
          .order('created_at', { ascending: false });

        if (requestsError) {
          console.error('Error fetching schedule requests:', requestsError);
          warnings.push('Schedule requests');
        } else {
          setScheduleRequests(requestsData || []);
        }
      } else {
        setScheduleRequests([]);
      }

      setLoadWarnings(warnings);
      if (warnings.length > 0) {
        toast.error(`Some schedule data failed to load: ${warnings.join(', ')}`);
      }
      setLoading(false);
    };

    fetchData();
  }, [companyId, reloadToken]);

  // Helper: Format date key YYYY-MM-DD
  const formatDateKey = (date) => {
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
  };

  // Helper: Start of month
  const startOfMonth = (date) => {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Helper: End of month
  const endOfMonth = (date) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  // Jobs by date map (for calendar view)
  const jobsByDate = useMemo(() => {
    if (!jobs.length) return {};

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    // Include 1 week buffer for leading/trailing days
    const viewStart = new Date(monthStart);
    viewStart.setDate(viewStart.getDate() - 7);
    const viewEnd = new Date(monthEnd);
    viewEnd.setDate(viewEnd.getDate() + 7);

    const map = {};
    jobs.forEach(job => {
      if (!job.service_date) return;

      const jobDate = new Date(job.service_date);
      jobDate.setHours(0, 0, 0, 0);

      // Only include jobs in the visible month range
      if (jobDate < viewStart || jobDate > viewEnd) return;

      // Apply filters
      if (!includeCanceled && job.status === 'Canceled') return;
      if (selectedCrew && job.assigned_team_id !== selectedCrew) return;

      const dateKey = formatDateKey(jobDate);
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(job);
    });

    // Sort jobs within each day
    Object.keys(map).forEach(dateKey => {
      map[dateKey].sort((a, b) => {
        const titleA = (a.services_performed || '').toLowerCase();
        const titleB = (b.services_performed || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
    });

    return map;
  }, [jobs, currentMonth, selectedCrew, includeCanceled]);

  // Jobs for week view (enriched with customer/crew names)
  const weekViewJobs = useMemo(() => {
    if (!jobs.length) return [];

    // Determine week start (Sunday) from selectedDate
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    const weekStart = new Date(selected);
    weekStart.setDate(selected.getDate() - selected.getDay());
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    // Build lookup maps
    const customersById = {};
    customers.forEach(c => { customersById[c.id] = c; });
    
    // Build team display name helper
    const teamMemberCountByTeamId = {};
    const crewMemberByTeamId = {};
    teamMembers.forEach(tm => {
      if (!teamMemberCountByTeamId[tm.team_id]) {
        teamMemberCountByTeamId[tm.team_id] = 0;
      }
      teamMemberCountByTeamId[tm.team_id]++;
      if (teamMemberCountByTeamId[tm.team_id] === 1) {
        crewMemberByTeamId[tm.team_id] = tm.crew_members;
      } else {
        crewMemberByTeamId[tm.team_id] = null;
      }
    });

    const getTeamDisplayName = (teamId) => {
      if (!teamId) return 'Unassigned';
      const team = teams.find(t => t.id === teamId);
      if (!team) return 'Unassigned';
      const memberCount = teamMemberCountByTeamId[teamId] || 0;
      if (memberCount === 1 && crewMemberByTeamId[teamId]) {
        return crewMemberByTeamId[teamId].full_name;
      }
      return team.name;
    };

    // Build mapping: crew_member_id -> team_id (for fallback)
    const teamIdByCrewMemberId = {};
    teamMembers.forEach(tm => {
      if (tm.crew_member_id) {
        teamIdByCrewMemberId[tm.crew_member_id] = tm.team_id;
      }
    });

    const getJobAssigneeName = (job) => {
      if (job.assigned_team_id) {
        return getTeamDisplayName(job.assigned_team_id);
      }
      return 'Unassigned';
    };

    return jobs
      .filter(job => {
        if (!job.service_date) return false;

        // Get job span: [service_date .. scheduled_end_date || service_date]
        const jobStart = new Date(job.service_date);
        jobStart.setHours(0, 0, 0, 0);
        const jobEnd = job.scheduled_end_date 
          ? new Date(job.scheduled_end_date)
          : new Date(job.service_date);
        jobEnd.setHours(0, 0, 0, 0);

        // Include job if its span overlaps with the week
        // Job overlaps if: (jobStart <= weekEnd) AND (jobEnd >= weekStart)
        const weekStartDate = weekStart.getTime();
        const weekEndDate = weekEnd.getTime();
        const jobStartDate = jobStart.getTime();
        const jobEndDate = jobEnd.getTime();
        
        if (jobStartDate > weekEndDate || jobEndDate < weekStartDate) return false;

        // Apply filters
        if (!includeCanceled && job.status === 'Canceled') return false;
        if (selectedCrew && job.assigned_team_id !== selectedCrew) return false;

        return true;
      })
      .map(job => ({
        ...job,
        __customerName: customersById[job.customer_id]?.full_name || '',
        __assigneeName: getJobAssigneeName(job),
      }));
  }, [jobs, customers, crewMembers, selectedDate, selectedCrew, includeCanceled]);

  // Week start date for CalendarWeek
  const weekStartDate = useMemo(() => {
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    const start = new Date(selected);
    start.setDate(selected.getDate() - selected.getDay());
    return start;
  }, [selectedDate]);

  // Filter and group jobs (for agenda view)
  const filteredAndGroupedJobs = useMemo(() => {
    if (!jobs.length) return {};

    const startDate = new Date(selectedDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    if (dateRange === 'week') {
      endDate.setDate(endDate.getDate() + 6);
    }
    endDate.setHours(23, 59, 59, 999);

    let filtered = jobs.filter(job => {
      if (!job.service_date) return false;

      const jobDate = new Date(job.service_date);
      jobDate.setHours(0, 0, 0, 0);

      // Date range filter
      if (jobDate < startDate || jobDate > endDate) return false;

      // Status filter
      if (!includeCanceled && job.status === 'Canceled') return false;

      // Crew filter (now filters by team)
      if (selectedCrew && job.assigned_team_id !== selectedCrew) return false;

      return true;
    });

    // Sort by service date ascending, then by title
    filtered.sort((a, b) => {
      const dateA = new Date(a.service_date || 0);
      const dateB = new Date(b.service_date || 0);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      const titleA = (a.services_performed || '').toLowerCase();
      const titleB = (b.services_performed || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    // Group by date
    const grouped = {};
    filtered.forEach(job => {
      const dateKey = job.service_date ? job.service_date.split('T')[0] : 'no-date';
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(job);
    });

    return grouped;
  }, [jobs, selectedDate, dateRange, selectedCrew, includeCanceled]);

  // Date helpers
  const formatDateHeader = (dateStr) => {
    if (!dateStr || dateStr === 'no-date') return 'No Date';
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today.toISOString().split('T')[0]);
    setDateRange('day');
  };

  const goToPrevDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
    setDateRange('day');
  };

  const goToNextDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split('T')[0]);
    setDateRange('day');
  };

  const setQuickRange = (range) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (range === 'today') {
      setSelectedDate(today.toISOString().split('T')[0]);
      setDateRange('day');
    } else if (range === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setSelectedDate(tomorrow.toISOString().split('T')[0]);
      setDateRange('day');
    } else if (range === 'week') {
      setSelectedDate(today.toISOString().split('T')[0]);
      setDateRange('week');
    }
  };

  const formatCoordinate = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toFixed(5);
  };

  const handleOptimizeRoute = async () => {
    if (!selectedDate) return;

    setOptimizedRouteError('');
    setOptimizedRouteLoading(true);

    try {
      // Check job count before calling RPC
      const jobsForDate = jobs.filter(job => {
        if (!job.service_date) return false;
        const jobDateStr = job.service_date.split('T')[0]; // Get YYYY-MM-DD part
        if (jobDateStr !== selectedDate) return false;
        
        // If routeOptimizationCrew is set, filter by that crew
        if (routeOptimizationCrew && job.assigned_team_id !== routeOptimizationCrew) return false;
        
        // Exclude canceled jobs
        if (job.status === 'Canceled') return false;
        
        return true;
      });

      // Check if we have at least 2 jobs
      if (jobsForDate.length < 2) {
        const crewLabel = routeOptimizationCrew 
          ? (teams.find(t => t.id === routeOptimizationCrew)?.name || 'this crew')
          : 'this day';
        setOptimizedRouteError(`Add at least 2 scheduled jobs for ${crewLabel} to optimize a route.`);
        setOptimizedRoute([]);
        setOptimizedRouteLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('get_optimized_route_for_day', {
        p_service_date: selectedDate,
        p_assigned_team_id: routeOptimizationCrew || null
      });

      if (error) {
        throw error;
      }

      setOptimizedRoute(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error optimizing route:', error);
      if (String(error?.message || '').includes('FORBIDDEN')) {
        setOptimizedRouteError('You do not have access to route optimization.');
      } else {
        setOptimizedRouteError('Unable to optimize route right now.');
      }
      setOptimizedRoute([]);
    } finally {
      setOptimizedRouteLoading(false);
    }
  };

  const handleApplyOptimizedRoute = async () => {
    if (!selectedDate) return;
    if (!Array.isArray(optimizedRoute) || optimizedRoute.length === 0) return;

    setApplyOptimizedRouteResult(null);
    setApplyingOptimizedRoute(true);

    try {
      const { data, error } = await supabase.rpc('apply_optimized_route_for_day', {
        p_service_date: selectedDate,
        p_assigned_team_id: routeOptimizationCrew || null
      });

      if (error) {
        throw error;
      }

      const updatedCount = Number(data?.[0]?.updated_count || 0);
      const crewLabel = routeOptimizationCrew 
        ? (teams.find(t => t.id === routeOptimizationCrew)?.name || 'selected crew')
        : 'all crews';
      setApplyOptimizedRouteResult(`Applied optimized order to ${updatedCount} jobs (${crewLabel}).`);

      // Refresh jobs using the existing schedule load pattern.
      if (companyId) {
        const { data: jobsData, error: jobsError } = await supabase
          .from('jobs')
          .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
          .eq('company_id', companyId);

        if (jobsError) {
          console.error('Error refreshing jobs after apply optimized route:', jobsError);
        } else {
          setJobs(jobsData || []);
        }
      }
    } catch (error) {
      console.error('Error applying optimized route:', error);
      if (String(error?.message || '').includes('FORBIDDEN')) {
        setApplyOptimizedRouteResult('You do not have access to apply route optimization.');
      } else {
        setApplyOptimizedRouteResult('Unable to apply optimized route right now.');
      }
    } finally {
      setApplyingOptimizedRoute(false);
    }
  };

  // Actions
  const handleAssignCrew = async (jobId, teamId) => {
    // Capture previous assigned_team_id for rollback
    const job = jobs.find(j => j.id === jobId);
    const previousTeamId = job?.assigned_team_id || null;
    
    setReassigningJobs(prev => ({ ...prev, [jobId]: true }));
    
    // Optimistic update
    setJobs(prev => prev.map(job =>
      job.id === jobId ? { ...job, assigned_team_id: teamId || null } : job
    ));
    
    const { error } = await supabase
      .from('jobs')
      .update({ assigned_team_id: teamId || null })
      .eq('id', jobId);

    if (error) {
      console.error('Error assigning job:', error);
      // Rollback: restore previous assigned_team_id
      setJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, assigned_team_id: previousTeamId } : job
      ));
      
      if (error.code === 'PGRST116') {
        toast.error('Job not found. It may have been deleted.');
      } else if (error.code === '23503') {
        toast.error('Team not found. Please select a valid team.');
      } else {
        toast.error(error.message || 'Could not assign job.');
      }
      setReassigningJobs(prev => ({ ...prev, [jobId]: false }));
      return;
    }

    toast.success('Job assigned');
    setReassigningJobs(prev => ({ ...prev, [jobId]: false }));
  };

  const handleJobDateChange = async (jobId, newDateString) => {
    // Find job + old dates (from current state)
    const job = jobs.find((j) => String(j.id) === String(jobId));
    if (!job) return;

    const oldStart = job.service_date || null;
    const oldEnd = job.scheduled_end_date || job.service_date || null;
    const newStart = newDateString;

    // Nothing to do
    if (!jobId || !newStart || oldStart === newStart) return;

    // Calculate deltaDays (date-only, whole days)
    const oldStartDate = oldStart ? new Date(oldStart) : null;
    const newStartDate = new Date(newStart);
    
    if (!oldStartDate) return; // Can't calculate delta without old start
    
    // Calculate delta in whole days (date-only comparison)
    const deltaMs = newStartDate.getTime() - oldStartDate.getTime();
    const deltaDays = Math.round(deltaMs / (1000 * 60 * 60 * 24));

    // Calculate new end date: shift by same delta
    let newEnd = oldEnd;
    if (oldEnd) {
      const oldEndDate = new Date(oldEnd);
      oldEndDate.setDate(oldEndDate.getDate() + deltaDays);
      newEnd = oldEndDate.toISOString().split('T')[0];
    } else {
      // If no old end date, new end = new start (single-day job)
      newEnd = newStart;
    }

    const jobTitle = job?.services_performed || "Untitled Job";

    // Create a unique token for this reschedule to prevent stale responses
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    moveTokenByJobIdRef.current[jobId] = token;
    
    // Store pending reschedule info for Undo (both start and end)
    pendingReschedulesRef.current[jobId] = { 
      token, 
      oldStart, 
      oldEnd,
      newStart, 
      newEnd 
    };

    // Optimistic UI update (both dates)
    setJobs((prev) =>
      prev.map((j) => 
        String(j.id) === String(jobId) 
          ? { ...j, service_date: newStart, scheduled_end_date: newEnd }
          : j
      )
    );

    // Format date for toast (e.g., "Wed, Jan 21")
    const formattedDate = (() => {
      try {
        return new Date(newStart).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      } catch {
        return newStart;
      }
    })();

    // Show toast with Undo action
    const toastId = toast((t) => (
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-800">
          Job <span className="font-medium">"{jobTitle}"</span> rescheduled to <span className="font-medium">{formattedDate}</span>
        </div>
        <button
          className="text-xs underline text-slate-600 hover:text-slate-900 transition-colors"
          onClick={() => {
            toast.dismiss(t.id);

            // Verify this is still the latest reschedule for this job
            const pending = pendingReschedulesRef.current[jobId];
            if (!pending || pending.token !== token) {
              toast.error("This change is no longer undoable.");
              return;
            }

            // Create new token for undo operation
            const undoToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            moveTokenByJobIdRef.current[jobId] = undoToken;

            // Optimistic rollback: revert to oldStart and oldEnd immediately
            setJobs((prev) =>
              prev.map((j) =>
                String(j.id) === String(jobId) 
                  ? { ...j, service_date: pending.oldStart, scheduled_end_date: pending.oldEnd }
                  : j
              )
            );

            // Persist rollback to Supabase (both fields)
            (async () => {
              const { error } = await supabase
                .from("jobs")
                .update({ 
                  service_date: pending.oldStart,
                  scheduled_end_date: pending.oldEnd
                })
                .eq("id", jobId);

              // If another reschedule happened after undo started, ignore this response
              if (moveTokenByJobIdRef.current[jobId] !== undoToken) return;

              if (error) {
                // Rollback failed: revert UI back to newStart and newEnd
                setJobs((prev) =>
                  prev.map((j) =>
                    String(j.id) === String(jobId) 
                      ? { ...j, service_date: pending.newStart, scheduled_end_date: pending.newEnd }
                      : j
                  )
                );
                toast.error("Undo failed. Please try again.");
                
                // Refetch to ensure correctness after failure
                if (companyId) {
                  try {
                    const { data: jobsData } = await supabase
                      .from('jobs')
                      .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
                      .eq('company_id', companyId);
                    if (jobsData) setJobs(jobsData);
                  } catch {
                    // Ignore refetch errors
                  }
                }
              } else {
                // Undo successful: clear pending reschedule and refetch
                delete pendingReschedulesRef.current[jobId];
                toast.success("Move undone.");
                
                // Refetch after successful undo to guarantee correctness
                if (companyId) {
                  try {
                    const { data: jobsData } = await supabase
                      .from('jobs')
                      .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
                      .eq('company_id', companyId);
                    if (jobsData) setJobs(jobsData);
                  } catch {
                    // Ignore refetch errors
                  }
                }
              }
            })();
          }}
        >
          Undo
        </button>
      </div>
    ), { duration: 7000 });

    // Persist the change to Supabase (both service_date and scheduled_end_date)
    const { error } = await supabase
      .from("jobs")
      .update({ 
        service_date: newStart,
        scheduled_end_date: newEnd
      })
      .eq("id", jobId);

    // If another reschedule happened while waiting, ignore this result
    if (moveTokenByJobIdRef.current[jobId] !== token) return;

    if (error) {
      // Roll back optimistic change on error (both dates)
      setJobs((prev) =>
        prev.map((j) => 
          String(j.id) === String(jobId) 
            ? { ...j, service_date: oldStart, scheduled_end_date: oldEnd }
            : j
        )
      );
      toast.dismiss(toastId);
      toast.error("Failed to reschedule job. Change was reverted.");
      
      // Clear pending reschedule and refetch after failure
      delete pendingReschedulesRef.current[jobId];
      
      // Refetch to ensure correctness after failure
      if (companyId) {
        try {
          const { data: jobsData } = await supabase
            .from('jobs')
            .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
            .eq('company_id', companyId);
          if (jobsData) setJobs(jobsData);
        } catch {
          // Ignore refetch errors
        }
      }
      return;
    }

    // Success: do NOT refetch immediately (keeps UI fast)
    // The optimistic update is already applied and persisted
  };

  const handleResizeStart = async (jobId, newStartDate) => {
    // Find job + old dates (from current state)
    const job = jobs.find((j) => String(j.id) === String(jobId));
    if (!job) return;

    const oldStart = job.service_date || null;
    const oldEnd = job.scheduled_end_date || job.service_date || null;

    // Nothing to do
    if (!jobId || !newStartDate || oldStart === newStartDate) return;

    // Enforce: newStart <= oldEnd
    if (oldEnd && newStartDate > oldEnd) {
      toast.error("Start date cannot be after end date.");
      return;
    }

    const jobTitle = job?.services_performed || "Untitled Job";

    // Create a unique token for this resize to prevent stale responses
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    moveTokenByJobIdRef.current[jobId] = token;
    
    // Store pending resize info for Undo
    pendingReschedulesRef.current[jobId] = { 
      token, 
      oldStart, 
      oldEnd,
      newStart: newStartDate, 
      newEnd: oldEnd // End date stays the same
    };

    // Optimistic UI update
    setJobs((prev) =>
      prev.map((j) => 
        String(j.id) === String(jobId) 
          ? { ...j, service_date: newStartDate }
          : j
      )
    );

    // Format date for toast
    const formattedDate = (() => {
      try {
        return new Date(newStartDate).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      } catch {
        return newStartDate;
      }
    })();

    // Show toast with Undo action
    const toastId = toast((t) => (
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-800">
          Job <span className="font-medium">"{jobTitle}"</span> start resized to <span className="font-medium">{formattedDate}</span>
        </div>
        <button
          className="text-xs underline text-slate-600 hover:text-slate-900 transition-colors"
          onClick={() => {
            toast.dismiss(t.id);

            // Verify this is still the latest resize for this job
            const pending = pendingReschedulesRef.current[jobId];
            if (!pending || pending.token !== token) {
              toast.error("This change is no longer undoable.");
              return;
            }

            // Create new token for undo operation
            const undoToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            moveTokenByJobIdRef.current[jobId] = undoToken;

            // Optimistic rollback
            setJobs((prev) =>
              prev.map((j) =>
                String(j.id) === String(jobId) 
                  ? { ...j, service_date: pending.oldStart, scheduled_end_date: pending.oldEnd }
                  : j
              )
            );

            // Persist rollback to Supabase
            (async () => {
              const { error } = await supabase
                .from("jobs")
                .update({ 
                  service_date: pending.oldStart,
                  scheduled_end_date: pending.oldEnd
                })
                .eq("id", jobId);

              if (moveTokenByJobIdRef.current[jobId] !== undoToken) return;

              if (error) {
                setJobs((prev) =>
                  prev.map((j) =>
                    String(j.id) === String(jobId) 
                      ? { ...j, service_date: pending.newStart, scheduled_end_date: pending.newEnd }
                      : j
                  )
                );
                toast.error("Undo failed. Please try again.");
                
                if (companyId) {
                  try {
                    const { data: jobsData } = await supabase
                      .from('jobs')
                      .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
                      .eq('company_id', companyId);
                    if (jobsData) setJobs(jobsData);
                  } catch {
                    // Ignore refetch errors
                  }
                }
              } else {
                delete pendingReschedulesRef.current[jobId];
                toast.success("Resize undone.");
                
                if (companyId) {
                  try {
                    const { data: jobsData } = await supabase
                      .from('jobs')
                      .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
                      .eq('company_id', companyId);
                    if (jobsData) setJobs(jobsData);
                  } catch {
                    // Ignore refetch errors
                  }
                }
              }
            })();
          }}
        >
          Undo
        </button>
      </div>
    ), { duration: 7000 });

    // Persist the change to Supabase
    const { error } = await supabase
      .from("jobs")
      .update({ service_date: newStartDate })
      .eq("id", jobId);

    if (moveTokenByJobIdRef.current[jobId] !== token) return;

    if (error) {
      setJobs((prev) =>
        prev.map((j) => 
          String(j.id) === String(jobId) 
            ? { ...j, service_date: oldStart, scheduled_end_date: oldEnd }
            : j
        )
      );
      toast.dismiss(toastId);
      toast.error("Failed to resize job. Change was reverted.");
      
      delete pendingReschedulesRef.current[jobId];
      
      if (companyId) {
        try {
          const { data: jobsData } = await supabase
            .from('jobs')
            .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
            .eq('company_id', companyId);
          if (jobsData) setJobs(jobsData);
        } catch {
          // Ignore refetch errors
        }
      }
      return;
    }
  };

  const handleResizeEnd = async (jobId, newEndDate) => {
    // Find job + old dates (from current state)
    const job = jobs.find((j) => String(j.id) === String(jobId));
    if (!job) return;

    const oldStart = job.service_date || null;
    const oldEnd = job.scheduled_end_date || job.service_date || null;

    // Nothing to do
    if (!jobId || !newEndDate || oldEnd === newEndDate) return;

    // Enforce: newEnd >= oldStart
    if (oldStart && newEndDate < oldStart) {
      toast.error("End date cannot be before start date.");
      return;
    }

    const jobTitle = job?.services_performed || "Untitled Job";

    // Create a unique token for this resize to prevent stale responses
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    moveTokenByJobIdRef.current[jobId] = token;
    
    // Store pending resize info for Undo
    pendingReschedulesRef.current[jobId] = { 
      token, 
      oldStart, 
      oldEnd,
      newStart: oldStart, // Start date stays the same
      newEnd: newEndDate
    };

    // Optimistic UI update
    setJobs((prev) =>
      prev.map((j) => 
        String(j.id) === String(jobId) 
          ? { ...j, scheduled_end_date: newEndDate }
          : j
      )
    );

    // Format date for toast
    const formattedDate = (() => {
      try {
        return new Date(newEndDate).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      } catch {
        return newEndDate;
      }
    })();

    // Show toast with Undo action
    const toastId = toast((t) => (
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-800">
          Job <span className="font-medium">"{jobTitle}"</span> end resized to <span className="font-medium">{formattedDate}</span>
        </div>
        <button
          className="text-xs underline text-slate-600 hover:text-slate-900 transition-colors"
          onClick={() => {
            toast.dismiss(t.id);

            // Verify this is still the latest resize for this job
            const pending = pendingReschedulesRef.current[jobId];
            if (!pending || pending.token !== token) {
              toast.error("This change is no longer undoable.");
              return;
            }

            // Create new token for undo operation
            const undoToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            moveTokenByJobIdRef.current[jobId] = undoToken;

            // Optimistic rollback
            setJobs((prev) =>
              prev.map((j) =>
                String(j.id) === String(jobId) 
                  ? { ...j, service_date: pending.oldStart, scheduled_end_date: pending.oldEnd }
                  : j
              )
            );

            // Persist rollback to Supabase
            (async () => {
              const { error } = await supabase
                .from("jobs")
                .update({ 
                  service_date: pending.oldStart,
                  scheduled_end_date: pending.oldEnd
                })
                .eq("id", jobId);

              if (moveTokenByJobIdRef.current[jobId] !== undoToken) return;

              if (error) {
                setJobs((prev) =>
                  prev.map((j) =>
                    String(j.id) === String(jobId) 
                      ? { ...j, service_date: pending.newStart, scheduled_end_date: pending.newEnd }
                      : j
                  )
                );
                toast.error("Undo failed. Please try again.");
                
                if (companyId) {
                  try {
                    const { data: jobsData } = await supabase
                      .from('jobs')
                      .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
                      .eq('company_id', companyId);
                    if (jobsData) setJobs(jobsData);
                  } catch {
                    // Ignore refetch errors
                  }
                }
              } else {
                delete pendingReschedulesRef.current[jobId];
                toast.success("Resize undone.");
                
                if (companyId) {
                  try {
                    const { data: jobsData } = await supabase
                      .from('jobs')
                      .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
                      .eq('company_id', companyId);
                    if (jobsData) setJobs(jobsData);
                  } catch {
                    // Ignore refetch errors
                  }
                }
              }
            })();
          }}
        >
          Undo
        </button>
      </div>
    ), { duration: 7000 });

    // Persist the change to Supabase
    const { error } = await supabase
      .from("jobs")
      .update({ scheduled_end_date: newEndDate })
      .eq("id", jobId);

    if (moveTokenByJobIdRef.current[jobId] !== token) return;

    if (error) {
      setJobs((prev) =>
        prev.map((j) => 
          String(j.id) === String(jobId) 
            ? { ...j, service_date: oldStart, scheduled_end_date: oldEnd }
            : j
        )
      );
      toast.dismiss(toastId);
      toast.error("Failed to resize job. Change was reverted.");
      
      delete pendingReschedulesRef.current[jobId];
      
      if (companyId) {
        try {
          const { data: jobsData } = await supabase
            .from('jobs')
            .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date')
            .eq('company_id', companyId);
          if (jobsData) setJobs(jobsData);
        } catch {
          // Ignore refetch errors
        }
      }
      return;
    }
  };

  const handleOpenJob = (jobOrId) => {
    // Navigate to jobs page with query param to open the job
    const jobId = typeof jobOrId === 'string' ? jobOrId : jobOrId.id;
    navigate(`/admin/jobs?openJobId=${jobId}`);
  };

  const handleCreateJob = () => {
    navigate('/admin/jobs');
  };

  const handleCreateJobForDate = (dateString) => {
    // Navigate to jobs page with prefill params
    const params = new URLSearchParams({ prefillDate: dateString });
    if (selectedCrew) {
      params.set('prefillCrewId', selectedCrew);
    }
    navigate(`/admin/jobs?${params.toString()}`);
  };

  // View mode handlers
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('schedule:viewMode', mode);
  };

  // Calendar month navigation
  const goToPrevMonth = () => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() - 1);
    setCurrentMonth(newMonth);
  };

  const goToNextMonth = () => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + 1);
    setCurrentMonth(newMonth);
  };

  const goToThisMonth = () => {
    const today = new Date();
    today.setDate(1);
    setCurrentMonth(today);
  };

  // Day drawer handlers
  const handleDayClick = (dateKey) => {
    setSelectedDayDate(dateKey);
    setHighlightJobId(null);
    setDayDrawerOpen(true);
  };

  const handleJobPillClick = (dateKey, jobId) => {
    setSelectedDayDate(dateKey);
    setHighlightJobId(jobId);
    setDayDrawerOpen(true);
  };

  // Get jobs for selected day (for drawer)
  const dayDrawerJobs = useMemo(() => {
    if (!selectedDayDate) return [];

    const dayJobs = jobsByDate[selectedDayDate] || [];
    
    // Apply additional filtering if needed (already filtered in jobsByDate, but double-check)
    return dayJobs.filter(job => {
      if (!includeCanceled && job.status === 'Canceled') return false;
      if (selectedCrew && job.assigned_team_id !== selectedCrew) return false;
      return true;
    }).sort((a, b) => {
      const titleA = (a.services_performed || '').toLowerCase();
      const titleB = (b.services_performed || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });
  }, [selectedDayDate, jobsByDate, selectedCrew, includeCanceled]);

  // Get customer lookup
  const customersById = {};
  customers.forEach(c => { customersById[c.id] = c; });

  // Build schedule request map: job_id -> requested_date (latest)
  const scheduleRequestByJobId = useMemo(() => {
    const map = {};
    scheduleRequests.forEach(req => {
      // Only keep the latest request per job (already sorted by created_at desc)
      if (!map[req.job_id]) {
        map[req.job_id] = req.requested_date;
      }
    });
    return map;
  }, [scheduleRequests]);

  const sortedDateKeys = Object.keys(filteredAndGroupedJobs).sort();

  // Get unassigned jobs (assigned_team_id IS NULL, has service_date)
  const unassignedJobs = useMemo(() => {
    return jobs
      .filter(job => !job.assigned_team_id && job.service_date)
      .sort((a, b) => {
        // Sort by service_date ascending
        const dateA = new Date(a.service_date || 0);
        const dateB = new Date(b.service_date || 0);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 10); // Limit to 10 jobs
  }, [jobs]);

  // Jobs for Map View (filtered by current schedule filters, with location data)
  const mapViewJobs = useMemo(() => {
    if (!jobs.length) return [];

    const filtered = jobs.filter(job => {
      // Apply date range filter
      if (dateRange === 'day') {
        if (!job.service_date) return false;
        const jobDate = new Date(job.service_date).toISOString().split('T')[0];
        if (jobDate !== selectedDate) return false;
      } else if (dateRange === 'week') {
        if (!job.service_date) return false;
        const selected = new Date(selectedDate);
        selected.setHours(0, 0, 0, 0);
        const weekStart = new Date(selected);
        weekStart.setDate(selected.getDate() - selected.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        
        const jobDate = new Date(job.service_date);
        jobDate.setHours(0, 0, 0, 0);
        if (jobDate < weekStart || jobDate >= weekEnd) return false;
      }

      // Apply crew filter
      if (selectedCrew && job.assigned_team_id !== selectedCrew) return false;

      // Apply canceled filter
      if (!includeCanceled && job.status === 'Canceled') return false;

      // Only include jobs with valid location data
      const customer = customers.find(c => c.id === job.customer_id);
      if (!customer || !customer.latitude || !customer.longitude) return false;

      return true;
    });

    return filtered;
  }, [jobs, customers, selectedDate, dateRange, selectedCrew, includeCanceled]);

  // Group jobs by crew for Crew view
  const jobsByCrew = useMemo(() => {
    if (!jobs.length) return {};

    // Determine date range based on view mode and dateRange setting
    let startDate, endDate;
    
    if (viewMode === 'crew' || viewMode === 'calendar') {
      // For Crew and Calendar views, use month-based filtering (same as Calendar view)
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      startDate = monthStart;
      endDate = monthEnd;
    } else {
      // For Agenda/Week views, use selectedDate and dateRange
      startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      if (dateRange === 'week') {
        endDate.setDate(endDate.getDate() + 6);
      }
      endDate.setHours(23, 59, 59, 999);
    }

    // Filter jobs by date range and status
    let filtered = jobs.filter(job => {
      if (!job.service_date) return false;

      const jobDate = new Date(job.service_date);
      jobDate.setHours(0, 0, 0, 0);

      // Date range filter
      if (jobDate < startDate || jobDate > endDate) return false;

      // Status filter
      if (!includeCanceled && job.status === 'Canceled') return false;

      // Crew filter (if a specific crew is selected, only show that crew)
      if (selectedCrew && job.assigned_team_id !== selectedCrew) return false;

      return true;
    });

    // Sort by service_date ascending
    filtered.sort((a, b) => {
      const dateA = new Date(a.service_date || 0);
      const dateB = new Date(b.service_date || 0);
      return dateA.getTime() - dateB.getTime();
    });

    // Group by crew (assigned_team_id)
    const grouped = {};
    filtered.forEach(job => {
      const crewId = job.assigned_team_id || 'unassigned';
      if (!grouped[crewId]) {
        grouped[crewId] = [];
      }
      grouped[crewId].push(job);
    });

    return grouped;
  }, [jobs, selectedDate, dateRange, selectedCrew, includeCanceled, viewMode, currentMonth]);

  // Helper: Get crew display name
  const getCrewDisplayName = (crewId) => {
    if (crewId === 'unassigned') return 'Unassigned';
    const team = teams.find(t => t.id === crewId);
    if (!team) return 'Unknown Crew';
    
    const memberCount = teamMembers.filter(tm => tm.team_id === crewId).length;
    if (memberCount === 1) {
      const teamMember = teamMembers.find(tm => tm.team_id === crewId);
      if (teamMember?.crew_members) {
        return teamMember.crew_members.full_name;
      }
    }
    return team.name;
  };

  // Helper: Get crew member count
  const getCrewMemberCount = (crewId) => {
    if (crewId === 'unassigned') return 0;
    return teamMembers.filter(tm => tm.team_id === crewId).length;
  };

  // Drag-and-drop handlers for Crew View
  const handleCrewDragStart = (event) => {
    const { active } = event;
    const jobId = String(active.id);
    const job = jobs.find(j => String(j.id) === jobId);
    setDraggedJob(job);
    setActiveDragJobId(jobId);
  };

  const handleCrewDragEnd = async (event) => {
    const { active, over } = event;
    setDraggedJob(null);
    setActiveDragJobId(null);

    if (!over) return;

    const jobId = String(active.id);
    const targetCrewId = String(over.id);

    // Extract crew ID from droppable ID (format: "crew-drop-{crewId}" or "crew-drop-unassigned")
    const crewId = targetCrewId.replace('crew-drop-', '');
    const newTeamId = crewId === 'unassigned' ? null : crewId;

    // Find the job to get current assignment
    const job = jobs.find(j => String(j.id) === jobId);
    if (!job) return;

    // No-op if dropped on same crew
    const currentTeamId = job.assigned_team_id || null;
    if (currentTeamId === newTeamId || (currentTeamId === null && newTeamId === null)) {
      return;
    }

    // Reassign using existing handler (includes rollback on error)
    await handleAssignCrew(jobId, newTeamId);
  };

  const handleCrewDragCancel = () => {
    setDraggedJob(null);
    setActiveDragJobId(null);
  };

  // Helper: Get crew color
  const getCrewColor = (crewId) => {
    if (crewId === 'unassigned') return null;
    const team = teams.find(t => t.id === crewId);
    return team?.color || null;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Schedule"
        subtitle="Plan and manage upcoming work by day and worker."
        actions={
          activeTab === 'schedule' && (
            <Button
              onClick={() => handleTabChange('requests')}
              variant="secondary"
              className="px-4 py-2"
            >
              Schedule Requests {scheduleRequests.length > 0 && `(${scheduleRequests.length})`}
            </Button>
          )
        }
      />

      {/* Tab Navigation */}
      <Card>
        <div className="border-b border-slate-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => handleTabChange('schedule')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'schedule'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Schedule
            </button>
            <button
              onClick={() => handleTabChange('requests')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'requests'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Schedule Requests {scheduleRequests.length > 0 && `(${scheduleRequests.length})`}
            </button>
            <button
              onClick={() => handleTabChange('needs-scheduling')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'needs-scheduling'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Needs Scheduling
            </button>
          </nav>
        </div>
      </Card>

      {/* Tab Content */}
      {activeTab === 'requests' ? (
        <ScheduleRequestsTab companyId={companyId} jobIdParam={jobIdParam} onRequestChange={refreshScheduleRequestsCount} />
      ) : activeTab === 'needs-scheduling' ? (
        <ScheduleNeedsSchedulingTab companyId={companyId} />
      ) : (
        /* Default Schedule Tab - All existing schedule/dispatch functionality */
        <>

            {loadWarnings.length > 0 && (
              <Card className="border border-amber-300 bg-amber-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-900 mb-1">Some data failed to load</p>
                    <p className="text-xs text-amber-800">{loadWarnings.join(', ')}</p>
                  </div>
                  <Button
                    variant="secondary"
                    className="text-sm"
                    onClick={() => setReloadToken((prev) => prev + 1)}
                  >
                    Retry
                  </Button>
                </div>
              </Card>
            )}

            {/* Unassigned Jobs Panel */}
              {unassignedJobs.length > 0 && (
                <Card>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Unassigned Jobs ({unassignedJobs.length})
                      </h3>
                    </div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {unassignedJobs.map(job => {
                const customer = customersById[job.customer_id];
                const serviceDate = job.service_date ? new Date(job.service_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
                
                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">
                          {job.services_performed || 'Untitled Job'}
                        </span>
                        {serviceDate && (
                          <span className="text-xs text-slate-500">
                            {serviceDate}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {customer?.full_name || '—'}
                      </p>
                    </div>
                    <select
                      value={job.assigned_team_id || ""}
                      onChange={(e) => handleAssignCrew(job.id, e.target.value)}
                      className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">Assign crew...</option>
                      {teams.map((team) => {
                        const memberCount = teamMembers.filter(tm => tm.team_id === team.id).length;
                        const displayName = memberCount === 1 
                          ? (teamMembers.find(tm => tm.team_id === team.id)?.crew_members?.full_name || team.name)
                          : team.name;
                        return (
                          <option key={team.id} value={team.id}>
                            {displayName}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
                  </div>
                </div>
              </Card>
            )}

            {/* Command bar — view, date nav, filters (sticky below topbar) */}
            <div className="sticky top-14 sm:top-16 z-10 bg-white/95 backdrop-blur border-b border-slate-200 mb-6 rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                {/* LEFT: View toggle */}
                <div className="flex border border-slate-300 rounded-lg overflow-hidden flex-shrink-0">
                  {['agenda', 'calendar', 'week', 'crew', 'map'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleViewModeChange(mode)}
                      className={`px-3 py-2 text-sm font-medium capitalize border-r border-slate-300 last:border-r-0 transition-colors ${
                        viewMode === mode
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {mode === 'agenda' ? 'Agenda' : mode === 'calendar' ? 'Calendar' : mode === 'week' ? 'Week' : mode === 'crew' ? 'Crew' : 'Map'}
                    </button>
                  ))}
                </div>

                {/* CENTER: Date navigation */}
                {viewMode === 'agenda' || viewMode === 'week' ? (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Button onClick={goToToday} variant="primary" className="text-sm font-semibold px-4 py-2">
                      Today
                    </Button>
                    <Button onClick={goToPrevDay} variant="tertiary" className="text-sm px-3 py-2">
                      ← Prev
                    </Button>
                    <Button onClick={goToNextDay} variant="tertiary" className="text-sm px-3 py-2">
                      Next →
                    </Button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setDateRange('day');
                      }}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Button onClick={goToThisMonth} variant="primary" className="text-sm font-semibold px-4 py-2">
                      This Month
                    </Button>
                    <Button onClick={goToPrevMonth} variant="tertiary" className="text-sm px-3 py-2">
                      ← Prev
                    </Button>
                    <Button onClick={goToNextMonth} variant="tertiary" className="text-sm px-3 py-2">
                      Next →
                    </Button>
                    <span className="text-sm font-semibold text-slate-900 min-w-[8rem]">
                      {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                )}

                {/* RIGHT: Filters */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="schedule-crew-filter" className="text-sm font-medium text-slate-700 whitespace-nowrap">
                      {crewLabel}:
                    </label>
                    <select
                      id="schedule-crew-filter"
                      value={selectedCrew}
                      onChange={(e) => setSelectedCrew(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent min-w-[8rem]"
                    >
                      <option value="">All</option>
                      {teams.map(team => {
                        const memberCount = teamMembers.filter(tm => tm.team_id === team.id).length;
                        const displayName = memberCount === 1 
                          ? (teamMembers.find(tm => tm.team_id === team.id)?.crew_members?.full_name || team.name)
                          : team.name;
                        return (
                          <option key={team.id} value={team.id}>
                            {displayName}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCanceled}
                      onChange={(e) => setIncludeCanceled(e.target.checked)}
                      className="rounded border-slate-300 text-slate-700 focus:ring-slate-400"
                    />
                    <span className="text-sm text-slate-700">Include Canceled</span>
                  </label>
                </div>
              </div>
            </div>

        <Card>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold">Route Planning</h2>
            <p className="text-sm text-slate-600">
              Plan and optimize stop order for the selected service date. Use this for scheduling and route planning.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleOptimizeRoute}
              disabled={!selectedDate || optimizedRouteLoading || applyingOptimizedRoute}
              title="Optimize planned route order for this date"
            >
              {optimizedRouteLoading ? 'Optimizing...' : 'Optimize Planned Route'}
            </Button>
            <Button
              variant="secondary"
              onClick={handleApplyOptimizedRoute}
              disabled={
                optimizedRouteLoading ||
                applyingOptimizedRoute ||
                !Array.isArray(optimizedRoute) ||
                optimizedRoute.length === 0
              }
              title="Apply the optimized route order to jobs"
            >
              {applyingOptimizedRoute ? 'Applying...' : 'Apply Planned Order'}
            </Button>
          </div>
        </div>

        {/* Crew selector for route optimization */}
        <div className="mb-4 pb-4 border-b border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Plan route for:
          </label>
          <select
            value={routeOptimizationCrew}
            onChange={(e) => setRouteOptimizationCrew(e.target.value)}
            disabled={optimizedRouteLoading || applyingOptimizedRoute}
            className="w-full max-w-xs border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">All Crews</option>
            {teams.map((team) => {
              const memberCount = teamMembers.filter(tm => tm.team_id === team.id).length;
              const displayName = memberCount === 1 
                ? (teamMembers.find(tm => tm.team_id === team.id)?.crew_members?.full_name || team.name)
                : team.name;
              return (
                <option key={team.id} value={team.id}>
                  {displayName}
                </option>
              );
            })}
          </select>
          {routeOptimizationCrew && (
            <p className="text-xs text-slate-500 mt-1">
              Planning route for: <span className="font-medium">{teams.find(t => t.id === routeOptimizationCrew)?.name || 'Selected crew'}</span>
            </p>
          )}
        </div>

        {optimizedRouteLoading ? (
          <div className="text-sm text-slate-500">Optimizing planned route...</div>
        ) : (
          <div className="space-y-3">
            {optimizedRouteError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {optimizedRouteError}
              </div>
            )}

            {applyOptimizedRouteResult && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  applyOptimizedRouteResult.includes('do not have access') ||
                  applyOptimizedRouteResult.includes('Unable to apply')
                    ? 'border border-red-200 bg-red-50 text-red-700'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {applyOptimizedRouteResult}
              </div>
            )}

            {optimizedRoute && optimizedRoute.length > 0 && (
              <>
                <div className="text-sm text-slate-600">{optimizedRoute.length} stops in planned route</div>
                <div className="space-y-2">
                  {optimizedRoute.map((stop) => (
                    <div
                      key={stop.job_id}
                      className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-800 font-semibold text-sm flex items-center justify-center">
                          {stop.route_order}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{stop.customer_name || '—'}</div>
                          <div className="text-xs text-slate-500">
                            {formatCoordinate(stop.latitude)}, {formatCoordinate(stop.longitude)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {optimizedRoute && optimizedRoute.length === 0 && !optimizedRouteError && (
              <div className="text-sm text-slate-500">
                {routeOptimizationCrew 
                  ? `No routable jobs found for ${teams.find(t => t.id === routeOptimizationCrew)?.name || 'selected crew'} on that date.`
                  : 'No routable jobs found for that date.'}
              </div>
            )}
            </div>
          )}
        </Card>

        {/* Schedule canvas — main focus */}
        <div className="mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading schedule...</div>
      ) : viewMode === 'agenda' ? (
        sortedDateKeys.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-600 mb-4">No jobs scheduled</p>
            <Button onClick={handleCreateJob} variant="secondary">
              Create Job
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDateKeys.map(dateKey => (
              <div key={dateKey}>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  {formatDateHeader(dateKey)}
                </h3>
                <div className="space-y-2">
                  {filteredAndGroupedJobs[dateKey].map(job => {
                    const customer = customersById[job.customer_id];
                    return (
                      <div key={job.id} className="rounded-lg shadow-sm border border-slate-200 bg-white overflow-hidden">
                        <ScheduleJobRow
                          job={job}
                          customer={customer}
                          crewMembers={crewMembers}
                          teams={teams}
                          teamMembers={teamMembers}
                          crewLabel={crewLabel}
                          onOpen={handleOpenJob}
                          onAssignCrew={handleAssignCrew}
                          scheduleRequestByJobId={scheduleRequestByJobId}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      ) : viewMode === 'week' ? (
        <div className="overflow-x-auto -m-1 p-1">
            <CalendarWeek
              jobs={weekViewJobs}
              weekStart={weekStartDate}
              onDayClick={handleDayClick}
              onJobOpen={handleOpenJob}
              onJobDateChange={handleJobDateChange}
              onJobResizeStart={handleResizeStart}
              onJobResizeEnd={handleResizeEnd}
              onCreateJob={handleCreateJobForDate}
              highlightJobId={highlightJobId}
              scheduleRequestByJobId={scheduleRequestByJobId}
            />
          </div>
      ) : viewMode === 'crew' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleCrewDragStart}
          onDragEnd={handleCrewDragEnd}
          onDragCancel={handleCrewDragCancel}
        >
          <div className="space-y-6">
              {Object.keys(jobsByCrew).length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-600 mb-4">No jobs scheduled</p>
                  <Button onClick={handleCreateJob} variant="secondary">
                    Create Job
                  </Button>
                </div>
              ) : (
                // Sort crew IDs: unassigned first, then by crew name
                Object.keys(jobsByCrew)
                  .sort((a, b) => {
                    if (a === 'unassigned') return -1;
                    if (b === 'unassigned') return 1;
                    const nameA = getCrewDisplayName(a);
                    const nameB = getCrewDisplayName(b);
                    return nameA.localeCompare(nameB);
                  })
                  .map(crewId => {
                    const crewJobs = jobsByCrew[crewId];
                    const crewName = getCrewDisplayName(crewId);
                    const memberCount = getCrewMemberCount(crewId);
                    const crewColor = getCrewColor(crewId);
                    const isUnassigned = crewId === 'unassigned';
                    
                    return (
                      <CrewDropZone
                        key={crewId}
                        crewId={crewId}
                        crewName={crewName}
                        memberCount={memberCount}
                        crewColor={crewColor}
                        isUnassigned={isUnassigned}
                        crewJobs={crewJobs}
                        customersById={customersById}
                        teams={teams}
                        teamMembers={teamMembers}
                        scheduleRequestByJobId={scheduleRequestByJobId}
                        onOpenJob={handleOpenJob}
                        onAssignCrew={handleAssignCrew}
                        reassigningJobs={reassigningJobs}
                        activeDragJobId={activeDragJobId}
                      />
                    );
                  })
                )}
              </div>
            <DragOverlay>
              {draggedJob ? (
                <CrewJobDragPreview job={draggedJob} customersById={customersById} />
              ) : null}
            </DragOverlay>
          </DndContext>
      ) : viewMode === 'map' ? (
        <div className="min-h-[400px]">
          <MapDispatchView
            jobs={mapViewJobs}
            customers={customers}
            teams={teams}
            teamMembers={teamMembers}
            getCrewDisplayName={getCrewDisplayName}
            getCrewColor={getCrewColor}
            onOpenJob={handleOpenJob}
          />
        </div>
      ) : (
        <div className="overflow-x-auto -m-1 p-1">
            <CalendarMonth
              currentMonth={currentMonth}
              jobsByDate={jobsByDate}
              customersById={customersById}
              onDayClick={handleDayClick}
              onJobPillClick={handleJobPillClick}
              highlightJobId={highlightJobId}
              scheduleRequestByJobId={scheduleRequestByJobId}
            />
          </div>
        )}
        </div>

        {/* Day Jobs Drawer */}
          <DayJobsDrawer
            open={dayDrawerOpen}
            onClose={() => {
              setDayDrawerOpen(false);
              setHighlightJobId(null);
            }}
            selectedDate={selectedDayDate}
            jobs={dayDrawerJobs}
            customersById={customersById}
            crewMembers={crewMembers}
            teams={teams}
            teamMembers={teamMembers}
            crewLabel={crewLabel}
            selectedCrew={selectedCrew}
            onCrewFilterChange={setSelectedCrew}
            includeCanceled={includeCanceled}
            onIncludeCanceledChange={setIncludeCanceled}
            onOpenJob={handleOpenJob}
            scheduleRequestByJobId={scheduleRequestByJobId}
            onAssignCrew={handleAssignCrew}
            onCreateJob={handleCreateJob}
            highlightJobId={highlightJobId}
          />
        </>
      )}
    </div>
  );
}

