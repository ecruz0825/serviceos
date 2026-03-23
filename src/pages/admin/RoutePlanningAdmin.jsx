import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useUser } from '../../context/UserContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { useBillingGuard } from '../../components/ui/BillingGuard';
import BillingGuard from '../../components/ui/BillingGuard';
import { Route, MapPin, Calendar, Users, RefreshCw, Play, Info } from 'lucide-react';
import { formatDate } from '../../utils/dateFormatting';

// Format YYYY-MM-DD date string as local date (no timezone shift)
const formatDateOnly = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    // Parse YYYY-MM-DD as local date components to avoid UTC interpretation
    const [year, month, day] = dateStr.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return 'N/A';
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return 'N/A';
  }
};

export default function RoutePlanningAdmin() {
  const { effectiveCompanyId, supportMode } = useUser();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [serviceDate, setServiceDate] = useState(() => {
    // Default to today in YYYY-MM-DD format for input[type="date"]
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [generatingRoute, setGeneratingRoute] = useState(false);
  const [refreshingRoute, setRefreshingRoute] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [routeError, setRouteError] = useState(null);

  // Load teams for current company
  useEffect(() => {
    if (!effectiveCompanyId) return;

    const fetchTeams = async () => {
      setLoadingTeams(true);
      try {
        const { data, error } = await supabase
          .from('teams')
          .select('id, name')
          .eq('company_id', effectiveCompanyId)
          .order('name');

        if (error) {
          console.error('Error fetching teams:', error);
          toast.error('Failed to load teams');
        } else {
          setTeams(data || []);
          // Preselect first team if available
          if (data && data.length > 0 && !selectedTeamId) {
            setSelectedTeamId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Unexpected error fetching teams:', err);
        toast.error('Failed to load teams');
      } finally {
        setLoadingTeams(false);
      }
    };

    fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompanyId]);

  // Auto-load existing route when date/team change (only depends on primitive values)
  useEffect(() => {
    // Guard: only fetch if both values are present and not currently generating/refreshing
    if (!serviceDate || !selectedTeamId || generatingRoute || refreshingRoute) {
      return;
    }

    let cancelled = false;

    const fetchRoute = async () => {
      setRefreshingRoute(true);
      setRouteError(null);

      try {
        const { data, error } = await supabase.rpc(
          'get_team_route_for_day',
          {
            p_service_date: serviceDate,
            p_team_id: selectedTeamId
          }
        );

        if (cancelled) return;

        if (error) {
          console.error('Error loading route:', error);
          const errorMessage = error.message || 'Failed to load route';
          setRouteError(errorMessage);
          // Don't show toast for "no route found" - that's expected
          if (!errorMessage.includes('not found')) {
            toast.error(errorMessage);
          }
          setRouteData(null);
          return;
        }

        if (data && data.length > 0) {
          // Group route data - first row has route header, all rows have stops
          const firstRow = data[0];
          const stops = data.map(row => ({
            stop_order: row.stop_order,
            job_id: row.job_id,
            customer_id: row.customer_id,
            customer_name: row.customer_name,
            address: row.address,
            latitude: row.latitude,
            longitude: row.longitude
          }));

          setRouteData({
            route_run_id: firstRow.route_run_id,
            service_date: firstRow.service_date,
            team_id: firstRow.team_id,
            status: firstRow.status,
            generation_method: firstRow.generation_method,
            total_stops: firstRow.total_stops,
            created_at: firstRow.created_at,
            stops: stops
          });
        } else {
          setRouteData(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Unexpected error loading route:', err);
        const errorMessage = err.message || 'Failed to load route';
        setRouteError(errorMessage);
        toast.error(errorMessage);
        setRouteData(null);
      } finally {
        if (!cancelled) {
          setRefreshingRoute(false);
        }
      }
    };

    fetchRoute();

    return () => {
      cancelled = true;
    };
  }, [serviceDate, selectedTeamId]);

  // Define loadRoute for manual refresh button (separate from auto-load)
  const loadRoute = useCallback(async () => {
    if (!serviceDate || !selectedTeamId) return;

    setRefreshingRoute(true);
    setRouteError(null);

    try {
      const { data, error } = await supabase.rpc(
        'get_team_route_for_day',
        {
          p_service_date: serviceDate,
          p_team_id: selectedTeamId
        }
      );

      if (error) {
        console.error('Error loading route:', error);
        const errorMessage = error.message || 'Failed to load route';
        setRouteError(errorMessage);
        // Don't show toast for "no route found" - that's expected
        if (!errorMessage.includes('not found')) {
          toast.error(errorMessage);
        }
        setRouteData(null);
        return;
      }

      if (data && data.length > 0) {
        // Group route data - first row has route header, all rows have stops
        const firstRow = data[0];
        const stops = data.map(row => ({
          stop_order: row.stop_order,
          job_id: row.job_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude
        }));

        setRouteData({
          route_run_id: firstRow.route_run_id,
          service_date: firstRow.service_date,
          team_id: firstRow.team_id,
          status: firstRow.status,
          generation_method: firstRow.generation_method,
          total_stops: firstRow.total_stops,
          created_at: firstRow.created_at,
          stops: stops
        });
      } else {
        setRouteData(null);
      }
    } catch (err) {
      console.error('Unexpected error loading route:', err);
      const errorMessage = err.message || 'Failed to load route';
      setRouteError(errorMessage);
      toast.error(errorMessage);
      setRouteData(null);
    } finally {
      setRefreshingRoute(false);
    }
  }, [serviceDate, selectedTeamId]);

  // Pre-generation validation
  const [validationSummary, setValidationSummary] = useState(null);
  const [showValidation, setShowValidation] = useState(false);

  const validateBeforeGeneration = async () => {
    if (!serviceDate || !selectedTeamId) {
      return { valid: false, message: 'Please select a date and team' };
    }

    try {
      // Fetch jobs for the selected team and date
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, assigned_team_id, customer:customers(address, latitude, longitude)')
        .eq('company_id', effectiveCompanyId)
        .eq('service_date', serviceDate)
        .eq('assigned_team_id', selectedTeamId);

      if (jobsError) {
        console.error('Error validating jobs:', jobsError);
        return { valid: true, summary: null }; // Continue anyway if validation fails
      }

      const jobs = jobsData || [];
      const totalJobs = jobs.length;
      const jobsWithAddress = jobs.filter(j => j.customer?.address && j.customer.address.trim() !== '').length;
      const jobsWithCoords = jobs.filter(j => j.customer?.latitude && j.customer?.longitude).length;
      const missingAddress = totalJobs - jobsWithAddress;
      const missingCoords = totalJobs - jobsWithCoords;

      const summary = {
        totalJobs,
        jobsWithAddress,
        jobsWithCoords,
        missingAddress,
        missingCoords,
        willUseFallback: missingCoords > 0
      };

      setValidationSummary(summary);
      return { valid: true, summary };
    } catch (err) {
      console.error('Unexpected error during validation:', err);
      return { valid: true, summary: null }; // Continue anyway
    }
  };

  const generateRoute = async () => {
    if (supportMode) {
      toast.error("Route generation is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Route generation is disabled due to billing status.");
      return;
    }

    if (!serviceDate || !selectedTeamId) {
      toast.error('Please select a date and team');
      return;
    }

    // Run validation first
    const validation = await validateBeforeGeneration();
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    // Show validation summary if available
    if (validation.summary) {
      setShowValidation(true);
      // Auto-continue after showing validation (user can still proceed)
      // For now, we'll just show it and continue
    }

    setGeneratingRoute(true);
    setRouteError(null);

    try {
      // Call generate RPC
      const { data: generateData, error: generateError } = await supabase.rpc(
        'generate_team_route_for_day',
        {
          p_service_date: serviceDate,
          p_team_id: selectedTeamId
        }
      );

      if (generateError) {
        console.error('Error generating route:', generateError);
        // Map technical errors to user-friendly messages
        let userMessage = 'Failed to generate route';
        const errorMsg = (generateError.message || '').toLowerCase();
        
        if (errorMsg.includes('no jobs') || errorMsg.includes('not found') || errorMsg.includes('no routable')) {
          userMessage = 'No routable jobs found for this team and date. Ensure jobs are assigned to this team and have valid addresses.';
        } else if (errorMsg.includes('team') && (errorMsg.includes('not found') || errorMsg.includes('invalid'))) {
          userMessage = 'Team selection is invalid. Please refresh and try again.';
        } else if (errorMsg.includes('date') || errorMsg.includes('service_date')) {
          userMessage = 'Invalid service date. Please select a valid date.';
        } else if (errorMsg.includes('permission') || errorMsg.includes('unauthorized')) {
          userMessage = 'You do not have permission to generate routes.';
        } else {
          userMessage = generateError.message || 'Failed to generate route. Please try again.';
        }
        
        setRouteError(userMessage);
        toast.error(userMessage);
        return;
      }

      // Check if route was actually generated (has route_run_id)
      if (!generateData || generateData.length === 0 || !generateData[0]?.route_run_id) {
        const errorMsg = 'No routable jobs found for this team and date. Ensure jobs are assigned to this team and have valid addresses.';
        toast.error(errorMsg);
        setRouteError(errorMsg);
        return;
      }

      // Immediately fetch the generated route
      await loadRoute();
      toast.success('Route generated successfully');
    } catch (err) {
      console.error('Unexpected error generating route:', err);
      const errorMessage = err.message || 'Failed to generate route';
      setRouteError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setGeneratingRoute(false);
    }
  };

  const openGoogleMaps = (address) => {
    if (!address) return;
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const canGenerate = serviceDate && selectedTeamId && !generatingRoute && !refreshingRoute;
  const isLoading = generatingRoute || refreshingRoute;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Route Viewer"
        subtitle="View and generate individual team routes for specific service dates. Use Schedule for route planning and optimization."
      />

      {/* Focal: Generate Route — primary action zone */}
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50/50 p-1 shadow-sm">
        <Card>
          <div className="space-y-5">
            {showValidation && validationSummary && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-900">Pre-Generation Validation</h3>
                  <button
                    onClick={() => setShowValidation(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="text-slate-700">
                    <span className="font-medium">{validationSummary.totalJobs}</span> job{validationSummary.totalJobs !== 1 ? 's' : ''} assigned to this team for {formatDateOnly(serviceDate)}
                  </div>
                  {validationSummary.missingAddress > 0 && (
                    <div className="text-amber-700">
                      <span className="font-medium">{validationSummary.missingAddress}</span> job{validationSummary.missingAddress !== 1 ? 's' : ''} missing address{validationSummary.missingAddress !== 1 ? 'es' : ''}
                    </div>
                  )}
                  {validationSummary.missingCoords > 0 && (
                    <div className="text-amber-700">
                      <span className="font-medium">{validationSummary.missingCoords}</span> job{validationSummary.missingCoords !== 1 ? 's' : ''} missing coordinates (route will use fallback ordering)
                    </div>
                  )}
                  {validationSummary.totalJobs === 0 && (
                    <div className="text-red-700 font-medium">
                      No jobs assigned to this team for the selected date.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Service Date Input */}
            <div>
              <label htmlFor="service-date" className="block text-sm font-medium text-slate-700 mb-1">
                Service Date
              </label>
              <input
                id="service-date"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            {/* Team Select */}
            <div>
              <label htmlFor="team-select" className="block text-sm font-medium text-slate-700 mb-1">
                Team
              </label>
              {loadingTeams ? (
                <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 flex items-center">
                  <LoadingSpinner size="sm" />
                  <span className="ml-2 text-sm text-slate-500">Loading teams...</span>
                </div>
              ) : (
                <select
                  id="team-select"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                  disabled={isLoading || teams.length === 0}
                >
                  {teams.length === 0 ? (
                    <option value="">No teams available</option>
                  ) : (
                    <>
                      <option value="">Select a team</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <Button
                onClick={generateRoute}
                disabled={!canGenerate || supportMode || billingDisabled}
                variant="primary"
                className="flex-1"
                title={supportMode ? "Route generation is disabled in support mode" : billingDisabled ? billingReason : undefined}
              >
                {generatingRoute ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Generate Route
                  </>
                )}
              </Button>
              <Button
                onClick={loadRoute}
                disabled={!canGenerate}
                variant="secondary"
              >
                <RefreshCw className={`h-4 w-4 ${refreshingRoute ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          </div>
        </Card>
      </div>

      {/* Purpose guidance — subtle */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            View or generate a route for a specific team and date. For route planning and optimization, use the Schedule tab.
          </p>
        </div>
      </div>

      {/* Validation Summary */}
      {isLoading && !routeData && (
        <div className="rounded-xl border border-slate-200 bg-white py-12">
          <LoadingSpinner text={generatingRoute ? "Generating route..." : "Loading route..."} />
        </div>
      )}

      {routeError && !isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white py-10 px-6 text-center">
          <p className="text-red-600 font-medium">Error loading route</p>
          <p className="text-sm text-slate-600 mt-2">{routeError}</p>
        </div>
      )}

      {!isLoading && !routeError && !routeData && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/30 py-12 px-6 text-center">
          <EmptyState
            icon={Route}
            title="No route for this team and date"
            description="Select a date and team above, then click Generate Route to build the run. Jobs must be assigned and have addresses."
          />
        </div>
      )}

      {!isLoading && routeData && (
        <Card>
          <div className="space-y-6">
            {/* Route Header Info */}
            <div className="border-b border-slate-200 pb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-slate-900">Route Details</h2>
                <div className="flex items-center gap-2">
                  <span 
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      routeData.status === 'published' ? 'bg-green-100 text-green-800' :
                      routeData.status === 'archived' ? 'bg-slate-100 text-slate-800' :
                      'bg-blue-100 text-blue-800'
                    }`}
                    title={
                      routeData.status === 'published' 
                        ? 'Published routes are finalized and visible to crew. They can still be regenerated if needed.'
                        : routeData.status === 'archived'
                        ? 'Archived routes are historical and no longer active.'
                        : 'Draft routes can be regenerated. They are visible to crew if no published route exists for the same team and date.'
                    }
                  >
                    {routeData.status}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Service Date:</span>
                  <p className="font-medium text-slate-900">
                    {formatDateOnly(routeData.service_date)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Team:</span>
                  <p className="font-medium text-slate-900">
                    {selectedTeam?.name || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Total Stops:</span>
                  <p className="font-medium text-slate-900">
                    {routeData.total_stops}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Method:</span>
                  <p className="font-medium text-slate-900 capitalize">
                    {routeData.generation_method}
                  </p>
                </div>
              </div>
            </div>

            {/* Stops List */}
            <div>
              <h3 className="text-md font-semibold text-slate-900 mb-4">Route Stops</h3>
              <div className="space-y-3">
                {routeData.stops.map((stop, index) => (
                  <div
                    key={`${stop.job_id}-${stop.stop_order}`}
                    className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <span className="text-sm font-semibold text-slate-700">{stop.stop_order}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-900">
                            {stop.customer_name || '—'}
                          </h4>
                          <div className="mt-1 flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm text-slate-600">
                                {stop.address || 'No address'}
                              </p>
                              {(stop.latitude && stop.longitude) && (
                                <p className="text-xs text-slate-400 mt-1">
                                  {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                                </p>
                              )}
                            </div>
                          </div>
                          {stop.job_id && (
                            <p className="text-xs text-slate-400 mt-1 font-mono">
                              Job: {stop.job_id.substring(0, 8)}...
                            </p>
                          )}
                        </div>
                        {stop.address && (
                          <Button
                            onClick={() => openGoogleMaps(stop.address)}
                            variant="tertiary"
                            className="flex-shrink-0"
                          >
                            <MapPin className="h-4 w-4 mr-1" />
                            Map
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
