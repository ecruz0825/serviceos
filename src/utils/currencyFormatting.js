/**
 * Shared currency formatting utilities
 * Matches current app formatting behavior
 */

/**
 * Format a number as currency (USD)
 * @param {number|string|null|undefined} amount - Amount to format
 * @param {object} options - Intl.NumberFormat options
 * @returns {string} Formatted currency string (e.g., "$123.45")
 */
export function formatCurrency(amount, options = {}) {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  
  if (isNaN(numAmount)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      ...options
    }).format(0);
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...options
  }).format(numAmount);
}

/**
 * Format a number as currency with 2 decimal places (for display)
 * @param {number|string|null|undefined} amount - Amount to format
 * @returns {string} Formatted currency string (e.g., "$123.45")
 */
export function formatCurrencyFixed(amount) {
  return formatCurrency(amount, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format a number as a simple dollar amount with 2 decimals (no currency symbol)
 * Used for inline display like "$123.45"
 * @param {number|string|null|undefined} amount - Amount to format
 * @returns {string} Formatted string (e.g., "123.45")
 */
export function formatAmount(amount) {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  
  if (isNaN(numAmount)) {
    return "0.00";
  }
  
  return numAmount.toFixed(2);
}
