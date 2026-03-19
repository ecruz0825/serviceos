// src/lib/productEvents.js
// Minimal product event logging utility for telemetry and observability
// Day 1 - Launch Package

import { supabase } from "../supabaseClient";

/**
 * Log a product event for analytics and observability.
 * 
 * @param {string} eventName - Event name (e.g., 'job_created', 'route_generated')
 * @param {Object} context - Optional context object (will be stored as JSONB)
 * @returns {Promise<void>}
 * 
 * @example
 * logProductEvent('job_created', { job_id: '123', customer_id: '456' });
 * logProductEvent('checkout_started', { plan: 'pro' });
 */
export async function logProductEvent(eventName, context = {}) {
  // Validate event name
  if (!eventName || typeof eventName !== 'string' || !eventName.trim()) {
    if (import.meta.env.DEV) {
      console.warn('[productEvents] Invalid event name:', eventName);
    }
    return;
  }

  try {
    const { error } = await supabase.rpc('log_product_event', {
      p_event_name: eventName.trim(),
      p_context: context || {}
    });

    if (error) {
      // Swallow errors in production to not block UX
      // Log warnings in dev for debugging
      if (import.meta.env.DEV) {
        console.warn('[productEvents] Failed to log event:', eventName, error);
      }
      // Silently fail in production
      return;
    }
  } catch (err) {
    // Catch any unexpected errors (network, etc.)
    if (import.meta.env.DEV) {
      console.warn('[productEvents] Unexpected error logging event:', eventName, err);
    }
    // Silently fail in production - never block user workflows
  }
}
