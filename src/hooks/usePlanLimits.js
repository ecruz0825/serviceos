// src/hooks/usePlanLimits.js
// Reusable hook for checking plan limits before mutations
// Day 1 - Launch Package (Proactive Limit Detection)

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../context/UserContext';

/**
 * usePlanLimits - Hook for checking plan limits and usage
 * 
 * Returns:
 * {
 *   plan: string - Current plan code (e.g., 'starter', 'pro')
 *   limits: { max_crew, max_customers, max_jobs_per_month }
 *   usage: { current_crew, current_customers, current_jobs_this_month }
 *   isLoading: boolean
 *   canAddCrew: boolean - true if can add crew member
 *   canAddCustomer: boolean - true if can add customer
 *   canCreateJob: boolean - true if can create job this month
 * }
 */
export default function usePlanLimits() {
  const { effectiveCompanyId } = useUser();
  const [plan, setPlan] = useState(null);
  const [limits, setLimits] = useState({
    max_crew: null,
    max_customers: null,
    max_jobs_per_month: null
  });
  const [usage, setUsage] = useState({
    current_crew: 0,
    current_customers: 0,
    current_jobs_this_month: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setIsLoading(false);
      return;
    }

    const fetchUsage = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_company_plan_usage', {
          p_company_id: effectiveCompanyId
        });

        if (error) {
          console.error('Error fetching plan usage:', error);
          setIsLoading(false);
          return;
        }

        const result = data?.[0];
        if (result) {
          setPlan(result.plan_code || null);
          setLimits({
            max_crew: result.max_crew,
            max_customers: result.max_customers,
            max_jobs_per_month: result.max_jobs_per_month
          });
          setUsage({
            current_crew: Number(result.current_crew) || 0,
            current_customers: Number(result.current_customers) || 0,
            current_jobs_this_month: Number(result.current_jobs_this_month) || 0
          });
        }
      } catch (err) {
        console.error('Unexpected error fetching plan usage:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsage();
  }, [effectiveCompanyId]);

  // Derived booleans: can add if limit is null (unlimited) or usage < limit
  const canAddCrew = limits.max_crew === null || usage.current_crew < limits.max_crew;
  const canAddCustomer = limits.max_customers === null || usage.current_customers < limits.max_customers;
  const canCreateJob = limits.max_jobs_per_month === null || usage.current_jobs_this_month < limits.max_jobs_per_month;

  return {
    plan,
    limits,
    usage,
    isLoading,
    canAddCrew,
    canAddCustomer,
    canCreateJob
  };
}
