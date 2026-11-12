/** RFC 4180 CSV, with spreadsheet formula injection neutralised (cells starting = + - @ tab CR). */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\r\n')

export function downloadCsv(name: string, rows: unknown[][]) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
