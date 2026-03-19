import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { useBrand } from '../../context/BrandContext';
import useCompanySettings from '../../hooks/useCompanySettings';
import { useCrewJobs } from '../../hooks/useCrewJobs';
import { getNextAction } from '../../utils/crewNextAction';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { Calendar, Clock, MapPin, Camera, CheckCircle, Eye } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function CrewDashboard() {
  const { settings } = useCompanySettings();
  const { brand } = useBrand();
  const { fullName, role, effectiveCompanyId } = useUser();
  const isAdmin = role && ['admin', 'manager', 'dispatcher'].includes(role);
  
  // Admin preview mode state
  const [previewCrewMemberId, setPreviewCrewMemberId] = useState(null);
  const [crewMembers, setCrewMembers] = useState([]);
  const [loadingCrewMembers, setLoadingCrewMembers] = useState(false);
  
  const { jobs, jobPayments, loading } = useCrewJobs(previewCrewMemberId);
  const navigate = useNavigate();

  const primaryColor = brand?.primaryColor || settings?.primary_color || '#2563eb';
  const secondaryColor = brand?.secondaryColor || brand?.primaryColor || '#2563eb';
  const crewLabel = settings?.crew_label || 'Crew';
  const companyName = brand?.companyDisplayName || 'Your Company';

  // Calculate KPIs and buckets
  const { kpis, nextUpJobs } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekFromNowStr = weekFromNow.toISOString().split('T')[0];

    let jobsToday = 0;
    let jobsThisWeek = 0;
    let needsPhotos = 0;
    let readyToComplete = 0;
    const nextUp = [];

    jobs.forEach(job => {
      const jobDate = job.service_date ? new Date(job.service_date).toISOString().split('T')[0] : null;
      const hasBefore = !!job.before_image;
      const hasAfter = !!job.after_image;
      const isCompleted = job.status === 'Completed';

      // Today's jobs
      if (jobDate === todayStr && !isCompleted) {
        jobsToday++;
      }

      // This week's jobs
      if (jobDate && jobDate >= todayStr && jobDate < weekFromNowStr && !isCompleted) {
        jobsThisWeek++;
      }

      // Needs photos (before or after)
      if (!isCompleted && (!hasBefore || (hasBefore && !hasAfter))) {
        needsPhotos++;
      }

      // Ready to complete
      if (!isCompleted && hasBefore && hasAfter) {
        readyToComplete++;
      }

      // Next Up: top 5 jobs sorted by service_date (or created_at)
      if (!isCompleted) {
        nextUp.push(job);
      }
    });

    // Sort next up by service_date, then route_order, then created_at
    nextUp.sort((a, b) => {
      const dateA = a.service_date ? new Date(a.service_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.service_date ? new Date(b.service_date).getTime() : Number.MAX_SAFE_INTEGER;
      if (dateA !== dateB) return dateA - dateB;

      const routeA = Number.isFinite(Number(a.route_order)) ? Number(a.route_order) : Number.MAX_SAFE_INTEGER;
      const routeB = Number.isFinite(Number(b.route_order)) ? Number(b.route_order) : Number.MAX_SAFE_INTEGER;
      if (routeA !== routeB) return routeA - routeB;

      const createdA = new Date(a.created_at || 0).getTime();
      const createdB = new Date(b.created_at || 0).getTime();
      return createdA - createdB;
    });

    return {
      kpis: {
        today: jobsToday,
        thisWeek: jobsThisWeek,
        needsPhotos,
        readyToComplete,
      },
      nextUpJobs: nextUp.slice(0, 5),
    };
  }, [jobs]);

  const todaysRouteStops = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    return jobs
      .filter((job) => {
        const jobDate = job.service_date ? new Date(job.service_date).toISOString().split('T')[0] : null;
        return jobDate === todayStr && job.status !== 'Completed';
      })
      .sort((a, b) => {
        const routeA = Number.isFinite(Number(a.route_order)) ? Number(a.route_order) : Number.MAX_SAFE_INTEGER;
        const routeB = Number.isFinite(Number(b.route_order)) ? Number(b.route_order) : Number.MAX_SAFE_INTEGER;
        if (routeA !== routeB) return routeA - routeB;

        const dateA = a.service_date ? new Date(a.service_date).getTime() : Number.MAX_SAFE_INTEGER;
        const dateB = b.service_date ? new Date(b.service_date).getTime() : Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      });
  }, [jobs]);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'No date';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'No date';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const jobDate = new Date(date);
      jobDate.setHours(0, 0, 0, 0);
      
      if (jobDate.getTime() === today.getTime()) {
        return 'Today';
      }
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (jobDate.getTime() === tomorrow.getTime()) {
        return 'Tomorrow';
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return 'No date';
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Get today's date string
  const getTodayDate = () => {
    return new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Load crew members for admin preview mode
  useEffect(() => {
    if (isAdmin && effectiveCompanyId) {
      setLoadingCrewMembers(true);
      const fetchCrewMembers = async () => {
        try {
          const { data, error } = await supabase
            .from('crew_members')
            .select('id, full_name')
            .eq('company_id', effectiveCompanyId)
            .order('full_name');
          
          if (error) {
            console.error('Error fetching crew members:', error);
            setCrewMembers([]);
          } else {
            setCrewMembers(data || []);
          }
        } catch (err) {
          console.error('Unexpected error fetching crew members:', err);
          setCrewMembers([]);
        } finally {
          setLoadingCrewMembers(false);
        }
      };
      fetchCrewMembers();
    } else {
      setCrewMembers([]);
      setPreviewCrewMemberId(null);
    }
  }, [isAdmin, effectiveCompanyId]);

  // Get selected crew member name for display
  const selectedCrewMemberName = useMemo(() => {
    if (!previewCrewMemberId) return null;
    const member = crewMembers.find(m => m.id === previewCrewMemberId);
    return member?.full_name || null;
  }, [previewCrewMemberId, crewMembers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Preview Mode Banner */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Admin Preview Mode</p>
                <p className="text-sm text-blue-700">Preview the Crew Portal as a selected crew member.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={previewCrewMemberId || ''}
                onChange={(e) => setPreviewCrewMemberId(e.target.value || null)}
                disabled={loadingCrewMembers}
                className="px-3 py-2 border border-blue-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px]"
              >
                <option value="">Select a crew member...</option>
                {crewMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || `Crew Member ${member.id.substring(0, 8)}`}
                  </option>
                ))}
              </select>
              {loadingCrewMembers && <LoadingSpinner size="sm" />}
            </div>
          </div>
          {!previewCrewMemberId && (
            <p className="text-xs text-blue-600 mt-2">
              Select a crew member above to preview their dashboard, jobs, and route.
            </p>
          )}
        </div>
      )}

      {/* Empty state for admin without preview selection */}
      {isAdmin && !previewCrewMemberId && (
        <EmptyState
          icon={Eye}
          title="Admin Preview Mode"
          description="Select a crew member from the dropdown above to preview their dashboard."
        />
      )}

      {/* Normal dashboard content (only show if not admin or if preview is selected) */}
      {(!isAdmin || previewCrewMemberId) && (
        <>
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">
              {getGreeting()}, {selectedCrewMemberName || fullName || 'there'}
            </h1>
            <p className="text-slate-600">
              {companyName} • {getTodayDate()}
            </p>
          </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4" style={{ borderLeftColor: secondaryColor }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Jobs Today</p>
              <p className="text-3xl font-bold text-slate-900">{kpis.today}</p>
            </div>
            <Calendar className="w-8 h-8 text-slate-400" />
          </div>
        </Card>

        <Card className="border-l-4" style={{ borderLeftColor: secondaryColor }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">This Week</p>
              <p className="text-3xl font-bold text-slate-900">{kpis.thisWeek}</p>
            </div>
            <Clock className="w-8 h-8 text-slate-400" />
          </div>
        </Card>

        <Card className="border-l-4" style={{ borderLeftColor: secondaryColor }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Needs Photos</p>
              <p className="text-3xl font-bold text-slate-900">{kpis.needsPhotos}</p>
            </div>
            <Camera className="w-8 h-8 text-slate-400" />
          </div>
        </Card>

        <Card className="border-l-4" style={{ borderLeftColor: secondaryColor }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Ready to Complete</p>
              <p className="text-3xl font-bold text-slate-900">{kpis.readyToComplete}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-slate-400" />
          </div>
        </Card>
      </div>

      {/* Next Up Section */}
      {nextUpJobs.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Next Up</h2>
            <Button
              variant="primary"
              onClick={() => navigate('/crew/jobs')}
              className="text-sm btn-accent"
            >
              View All Jobs
            </Button>
          </div>
          <div className="space-y-3">
            {nextUpJobs.map((job) => {
              const nextAction = getNextAction(job, jobPayments[job.id]);
              const actionColor = nextAction.type === 'attention' 
                ? 'text-amber-700 bg-amber-50 border-amber-200'
                : nextAction.type === 'done'
                ? 'text-slate-600 bg-slate-50 border-slate-200'
                : 'text-blue-700 bg-blue-50 border-blue-200';

              return (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                  onClick={() => navigate(`/crew/job/${job.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-slate-900 truncate">
                        {job.services_performed || 'Job'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600 mb-2">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {job.customer?.full_name || 'Customer'}
                      </span>
                      {job.customer?.address && (
                        <span className="truncate max-w-xs">{job.customer.address}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(job.service_date)}
                      </span>
                      {job.scheduled_end_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(job.scheduled_end_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${actionColor}`}>
                      {nextAction.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Today's Route */}
      <Card>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Today&apos;s Route</h2>
          <p className="text-sm text-slate-600">Your stops in planned order for today.</p>
        </div>
        {todaysRouteStops.length === 0 ? (
          <div className="text-sm text-slate-500">No route stops scheduled for today.</div>
        ) : (
          <div className="space-y-2">
            {todaysRouteStops.map((job, idx) => {
              const stopNumber = Number.isFinite(Number(job.route_order)) ? Number(job.route_order) : idx + 1;
              return (
                <div
                  key={job.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/crew/job/${job.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-800 font-semibold text-sm flex items-center justify-center">
                      {stopNumber}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{job.customer?.full_name || 'Customer'}</div>
                      <div className="text-xs text-slate-600 truncate">{job.services_performed || 'Job'}</div>
                      {job.customer?.address && (
                        <div className="text-xs text-slate-500 truncate">{job.customer.address}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-slate-500">{job.status || '—'}</span>
                    {Number.isFinite(Number(job.route_order)) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
                        Stop {stopNumber}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Primary Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          variant="primary"
          onClick={() => navigate('/crew/jobs')}
          className="flex-1 btn-accent"
        >
          View Jobs
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate('/crew/help')}
          className="flex-1 btn-secondary"
        >
          Need Help?
        </Button>
      </div>
        </>
      )}
    </div>
  );
}
