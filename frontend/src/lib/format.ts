export function formatCurrency(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '$0.00'
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '$0.00'
  
  const isNeg = num < 0
  const absFormatted = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(num))

  return isNeg ? `-${absFormatted}` : absFormatted
}

export function formatPercent(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0.00%'
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '0.00%'
  
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(2)}%`
}

function parseDateOnly(dateStr: string): Date | null {
  const parts = dateStr.split('T')[0].split('-')
  if (parts.length !== 3) return null
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return isNaN(d.getTime()) ? null : d
}

/** Compact axis label for long ranges, e.g. "Mar 2025". */
export function formatMonthYear(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const d = parseDateOnly(dateStr)
  if (!d) return dateStr
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

/** Compact axis label for short ranges, e.g. "1 Mar". */
export function formatDayMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const d = parseDateOnly(dateStr)
  if (!d) return dateStr
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    const parts = dateStr.split('T')[0].split('-')
    if (parts.length === 3) {
      const year = parseInt(parts[0])
      const month = parseInt(parts[1]) - 1
      const day = parseInt(parts[2])
      const d = new Date(year, month, day)
      return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    return dateStr
  } catch {
    return dateStr
  }
}
