/**
 * Shared date formatting utilities
 * Matches current app formatting behavior
 */

/**
 * Format a date string to a localized date string
 * @param {string|Date|null|undefined} dateStr - Date string or Date object
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string or "N/A" if invalid
 */
export function formatDate(dateStr, options = {}) {
  if (!dateStr) return "N/A";
  
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    
    if (isNaN(date.getTime())) {
      return "N/A";
    }
    
    // Default options match current app behavior
    const defaultOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...options
    };
    
    return date.toLocaleDateString(undefined, defaultOptions);
  } catch {
    return "N/A";
  }
}

/**
 * Format a date string to a short date (MM/DD/YYYY)
 * @param {string|Date|null|undefined} dateStr - Date string or Date object
 * @returns {string} Formatted date string or "N/A" if invalid
 */
export function formatDateShort(dateStr) {
  return formatDate(dateStr, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format a date string to ISO date (YYYY-MM-DD) for date inputs
 * @param {string|Date|null|undefined} dateStr - Date string or Date object
 * @returns {string} ISO date string or empty string if invalid
 */
export function formatDateISO(dateStr) {
  if (!dateStr) return '';
  
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    
    if (isNaN(date.getTime())) {
      return '';
    }
    
    // Extract date part only (YYYY-MM-DD)
    return dateStr.split('T')[0] || date.toISOString().split('T')[0];
  } catch {
    return '';
  }
}
