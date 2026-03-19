/**
 * Application Version Management
 * Exports version information from environment variables
 */

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";
export const BUILD_DATE = import.meta.env.VITE_BUILD_DATE || new Date().toISOString().split('T')[0];

/**
 * Get formatted version string for display
 * @returns {string} Formatted version string (e.g., "v1.0.0 (build: 2024-01-15)")
 */
export function getVersionString() {
  if (APP_VERSION === "dev") {
    return `dev (build: ${BUILD_DATE})`;
  }
  return `v${APP_VERSION} (build: ${BUILD_DATE})`;
}

/**
 * Get version info object
 * @returns {{version: string, buildDate: string, isDev: boolean}}
 */
export function getVersionInfo() {
  return {
    version: APP_VERSION,
    buildDate: BUILD_DATE,
    isDev: APP_VERSION === "dev",
  };
}
