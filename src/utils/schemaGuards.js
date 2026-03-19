/**
 * Schema Guards
 * Dev-only warnings to catch missing columns in Supabase query results.
 * Helps prevent schema drift from going unnoticed during development.
 * 
 * No production impact - only runs in development mode.
 */

// Track which entities have already been warned (per session)
const warnedEntities = new Set()

/**
 * Parse a Supabase select string into an array of column names
 * @param {string} selectString - Comma-separated column names (may include spaces/newlines)
 * @returns {string[]} Array of trimmed column names (empty strings filtered out)
 */
export function parseSelectString(selectString) {
  if (!selectString || typeof selectString !== 'string') {
    return []
  }
  return selectString
    .split(',')
    .map(col => col.trim())
    .filter(col => col.length > 0)
}

/**
 * Warn if required columns are missing from query results
 * @param {string} entityName - Identifier for the entity (e.g., 'RevenueHub.jobs')
 * @param {Array|null|undefined} rows - Array of row objects from Supabase query
 * @param {string[]} requiredColumns - Array of required column names
 */
export function warnIfMissingColumns(entityName, rows, requiredColumns) {
  // DEV ONLY: do nothing in production
  if (!import.meta.env.DEV) {
    return
  }

  // Early returns for invalid inputs
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return
  }

  // Avoid spamming: warn once per entity per session
  if (warnedEntities.has(entityName)) {
    return
  }

  // Check only the first row
  const firstRow = rows[0]
  if (!firstRow || typeof firstRow !== 'object') {
    return
  }

  // Find missing columns
  const missingColumns = requiredColumns.filter(
    col => !(col in firstRow)
  )

  // Warn if any columns are missing
  if (missingColumns.length > 0) {
    console.warn(
      `[SchemaGuard] ${entityName} missing columns: ${missingColumns.join(', ')}`
    )
    warnedEntities.add(entityName)
  }
}
