/**
 * Navigation configuration for role-based sidebar navigation.
 *
 * For admin (and platform_admin in support mode), we return grouped sections to
 * improve information architecture without changing routes/permissions.
 *
 * @param {Object} params
 * @param {string|null} params.role - User role ('admin', 'manager', 'dispatcher', 'crew', 'customer', 'platform_admin')
 * @param {Object} params.settings - Company settings from useCompanySettings
 * @param {boolean} params.supportMode - Whether platform_admin is impersonating a tenant
 * @returns {Array} Array of navigation items (flat, for backward compatibility)
 */
export function getNavItems({ role, settings, supportMode }) {
  const sections = getNavSections({ role, settings, supportMode });
  return sections.flatMap((s) => s.items);
}

/**
 * Returns navigation as grouped sections for clearer sidebar rendering.
 * Sidebar should prefer this to render section headers/dividers.
 *
 * @returns {Array<{ key: string, label?: string, items: Array<{label: string, path: string, icon?: string, isUtility?: boolean}> }>}
 */
export function getNavSections({ role, settings, supportMode }) {
  const crewLabel = settings?.crew_label || "Crew";
  const customerLabel = settings?.customer_label || "Customer";
  const customerLabelPlural = customerLabel.endsWith("s")
    ? customerLabel
    : `${customerLabel}s`;

  const primaryAdmin = [
    { label: "Dashboard", path: "/admin", icon: "dashboard", description: "Overview and quick actions" },
    { label: "Jobs", path: "/admin/jobs", icon: "briefcase", description: "Manage and track jobs" },
    { label: customerLabelPlural, path: "/admin/customers", icon: "users", description: "Client records and history" },
    { label: "Quotes", path: "/admin/quotes", icon: "file-text", description: "Estimates and approvals" },
    { label: "Operations", path: "/admin/operations", icon: "briefcase", description: "Schedule • Dispatch • Routes" },
    { label: "Finance", path: "/admin/finance", icon: "trending-up", description: "Payments • Expenses • Revenue" },
  ];

  const secondaryAdmin = [
    { label: crewLabel, path: "/admin/crew", icon: "users2" },
    { label: "Teams", path: "/admin/teams", icon: "user-group" },
    { label: "Recurring Jobs", path: "/admin/recurring-jobs", icon: "repeat" },
  ];

  const systemAdmin = [
    { label: "Settings", path: "/admin/settings", icon: "settings" },
    { label: "Billing", path: "/admin/billing", icon: "credit-card" },
  ];

  const utilityAdmin = [
    { label: "Worker Portal", path: "/crew", icon: "briefcase", isUtility: true },
  ];

  // Admin navigation
  if (role === "admin") {
    return [
      { key: "primary", label: "Primary", items: primaryAdmin },
      { key: "management", label: "Management", items: secondaryAdmin },
      { key: "system", label: "System", items: systemAdmin },
      { key: "utility", label: "Utility", items: utilityAdmin },
    ];
  }

  // Manager / Dispatcher navigation (Phase B.1: consolidated to Operations + Finance)
  if (role === "manager" || role === "dispatcher") {
    return [
      {
        key: "primary",
        label: "Primary",
        items: [
          { label: "Operations", path: "/admin/operations", icon: "briefcase", description: "Schedule • Dispatch • Routes" },
          { label: "Finance", path: "/admin/finance", icon: "trending-up", description: "Payments • Expenses • Revenue" },
        ],
      },
    ];
  }

  // Crew navigation (only for crew role, admin already has it above)
  if (role === "crew") {
    return [
      {
        key: "primary",
        items: [{ label: "Worker Portal", path: "/crew", icon: "briefcase" }],
      },
    ];
  }

  // Customer navigation
  if (role === "customer") {
    return [
      {
        key: "primary",
        items: [{ label: `${customerLabel} Portal`, path: "/customer", icon: "user" }],
      },
    ];
  }

  // Platform Admin navigation
  if (role === "platform_admin") {
    // If in support mode, show tenant admin navigation
    if (supportMode) {
      return [
        { key: "primary", label: "Primary", items: primaryAdmin },
        { key: "management", label: "Management", items: secondaryAdmin },
        { key: "system", label: "System", items: systemAdmin },
        // No Worker Portal link for platform_admin support mode by default
      ];
    } else {
      // Normal platform admin navigation
      return [
        {
          key: "primary",
          items: [
            { label: "Platform Dashboard", path: "/platform", icon: "dashboard" },
            { label: "Companies", path: "/platform/companies", icon: "users" },
          ],
        },
      ];
    }
  }

  return [{ key: "primary", items: [] }];
}

