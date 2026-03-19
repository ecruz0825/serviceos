export function toCsvValue(value) {
  if (value === null || value === undefined) return ''

  let normalized = value
  if (normalized instanceof Date) {
    normalized = normalized.toISOString()
  } else if (typeof normalized === 'number' || typeof normalized === 'boolean') {
    normalized = String(normalized)
  } else {
    normalized = String(normalized)
  }

  const escaped = normalized.replace(/"/g, '""')
  const needsQuoting = /[",\n\r]/.test(escaped)
  return needsQuoting ? `"${escaped}"` : escaped
}

export function buildCsv(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : []
  const safeColumns = Array.isArray(columns) ? columns : []

  const headerLine = safeColumns
    .map((col) => toCsvValue(col?.header ?? col?.key ?? ''))
    .join(',')

  const dataLines = safeRows.map((row) => {
    return safeColumns
      .map((col) => {
        const rawValue = row?.[col.key]
        const value = typeof col?.format === 'function' ? col.format(rawValue, row) : rawValue
        return toCsvValue(value)
      })
      .join(',')
  })

  return [headerLine, ...dataLines].join('\n')
}

export function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function exportRowsAsCsv({ filename, rows, columns }) {
  const csvContent = buildCsv(rows, columns)
  downloadCsv(filename, csvContent)
}
