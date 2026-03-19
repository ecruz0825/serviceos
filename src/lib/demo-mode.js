/**
 * Demo Mode Configuration
 * Scaffold for future demo mode implementation
 */

export const DEMO_MODE_ENABLED = import.meta.env.VITE_DEMO_MODE === "true";

/**
 * Check if demo mode is enabled
 * @returns {boolean}
 */
export function isDemoMode() {
  return DEMO_MODE_ENABLED;
}

/**
 * Get demo mode banner message
 * @returns {string|null} Banner message if demo mode is enabled, null otherwise
 */
export function getDemoModeBanner() {
  if (!DEMO_MODE_ENABLED) return null;
  return "Demo Mode Enabled - This is a demonstration environment";
}

/**
 * Check if an action should be hidden in demo mode
 * @param {string} action - Action identifier (e.g., "delete_customer", "void_invoice")
 * @returns {boolean} True if action should be hidden
 */
export function shouldHideAction(action) {
  if (!DEMO_MODE_ENABLED) return false;
  
  // Define destructive actions that should be hidden in demo mode
  const hiddenActions = [
    "delete_customer",
    "delete_job",
    "delete_quote",
    "void_invoice",
    "void_payment",
    "delete_company",
    "reset_database",
  ];
  
  return hiddenActions.includes(action);
}

/**
 * Get demo mode configuration
 * @returns {{enabled: boolean, banner: string|null, hiddenActions: string[]}}
 */
export function getDemoModeConfig() {
  return {
    enabled: DEMO_MODE_ENABLED,
    banner: getDemoModeBanner(),
    hiddenActions: DEMO_MODE_ENABLED ? [
      "delete_customer",
      "delete_job",
      "delete_quote",
      "void_invoice",
      "void_payment",
      "delete_company",
      "reset_database",
    ] : [],
  };
}
