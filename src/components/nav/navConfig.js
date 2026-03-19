/**
 * Navigation configuration for role-based sidebar navigation
 * @param {Object} params
 * @param {string|null} params.role - User role ('admin', 'manager', 'dispatcher', 'crew', 'customer')
 * @param {Object} params.settings - Company settings from useCompanySettings
 * @returns {Array} Array of navigation items
 */
export function getNavItems({ role, settings, supportMode }) {
  const crewLabel = settings?.crew_label || "Crew";
  const customerLabel = settings?.customer_label || "Customer";
  const customerLabelPlural = customerLabel.endsWith("s")
    ? customerLabel
    : `${customerLabel}s`;

  const items = [];

  // Admin navigation
  if (role === "admin") {
    items.push(
      {
        label: "Dashboard",
        path: "/admin",
        icon: "dashboard",
      },
      {
        label: "Jobs",
        path: "/admin/jobs",
        icon: "briefcase",
      },
      {
        label: customerLabelPlural,
        path: "/admin/customers",
        icon: "users",
      },
      {
        label: "Quotes",
        path: "/admin/quotes",
        icon: "file-text",
      },
      {
        label: "Operations",
        path: "/admin/operations",
        icon: "briefcase",
      },
      {
        label: "Finance",
        path: "/admin/finance",
        icon: "trending-up",
      },
      {
        label: crewLabel,
        path: "/admin/crew",
        icon: "users2",
      },
      {
        label: "Teams",
        path: "/admin/teams",
        icon: "user-group",
      },
      {
        label: "Payments",
        path: "/admin/payments",
        icon: "credit-card",
      },
      {
        label: "Expenses",
        path: "/admin/expenses",
        icon: "dollar-sign",
      },
      {
        label: "Recurring Jobs",
        path: "/admin/recurring-jobs",
        icon: "repeat",
      },
      {
        label: "Settings",
        path: "/admin/settings",
        icon: "settings",
      },
      {
        label: "Billing",
        path: "/admin/billing",
        icon: "credit-card",
      },
      {
        label: "Worker Portal",
        path: "/crew",
        icon: "briefcase",
      }
    );
  }

  // Manager / Dispatcher navigation (Phase B.1: consolidated to Operations + Finance)
  if (role === "manager" || role === "dispatcher") {
    items.push(
      {
        label: "Operations",
        path: "/admin/operations",
        icon: "briefcase",
      },
      {
        label: "Finance",
        path: "/admin/finance",
        icon: "trending-up",
      }
    );
  }

  // Crew navigation (only for crew role, admin already has it above)
  if (role === "crew") {
    items.push({
      label: "Worker Portal",
      path: "/crew",
      icon: "briefcase",
    });
  }

  // Customer navigation
  if (role === "customer") {
    items.push({
      label: `${customerLabel} Portal`,
      path: "/customer",
      icon: "user",
    });
  }

  // Platform Admin navigation
  if (role === "platform_admin") {
    // If in support mode, show tenant admin navigation
    if (supportMode) {
      items.push(
        {
          label: "Dashboard",
          path: "/admin",
          icon: "dashboard",
        },
        {
          label: "Jobs",
          path: "/admin/jobs",
          icon: "briefcase",
        },
        {
          label: customerLabelPlural,
          path: "/admin/customers",
          icon: "users",
        },
        {
          label: "Quotes",
          path: "/admin/quotes",
          icon: "file-text",
        },
        {
          label: "Operations",
          path: "/admin/operations",
          icon: "briefcase",
        },
        {
          label: "Finance",
          path: "/admin/finance",
          icon: "trending-up",
        },
        {
          label: crewLabel,
          path: "/admin/crew",
          icon: "users2",
        },
        {
          label: "Teams",
          path: "/admin/teams",
          icon: "user-group",
        },
        {
          label: "Payments",
          path: "/admin/payments",
          icon: "credit-card",
        },
        {
          label: "Expenses",
          path: "/admin/expenses",
          icon: "dollar-sign",
        },
        {
          label: "Recurring Jobs",
          path: "/admin/recurring-jobs",
          icon: "repeat",
        },
        {
          label: "Settings",
          path: "/admin/settings",
          icon: "settings",
        },
        {
          label: "Billing",
          path: "/admin/billing",
          icon: "credit-card",
        }
      );
    } else {
      // Normal platform admin navigation
      items.push({
        label: "Platform Dashboard",
        path: "/platform",
        icon: "dashboard",
      });
      items.push({
        label: "Companies",
        path: "/platform/companies",
        icon: "users",
      });
    }
  }

  return items;
}

