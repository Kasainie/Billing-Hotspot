const automaticBackupPattern = /^lktech-auto-(\d{8})-(\d{6})\.backup$/i

export function automaticBackupTimestamp(name) {
  if (typeof name !== 'string') return null
  const match = automaticBackupPattern.exec(name)
  if (!match) return null
  const [, date, time] = match
  const timestamp = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
    Number(time.slice(4, 6)),
  )
  const parsed = new Date(timestamp)
  return parsed.getUTCFullYear() === Number(date.slice(0, 4)) &&
    parsed.getUTCMonth() === Number(date.slice(4, 6)) - 1 &&
    parsed.getUTCDate() === Number(date.slice(6, 8)) &&
    parsed.getUTCHours() === Number(time.slice(0, 2)) &&
    parsed.getUTCMinutes() === Number(time.slice(2, 4)) &&
    parsed.getUTCSeconds() === Number(time.slice(4, 6))
    ? timestamp
    : null
}

export function automaticBackupName(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `lktech-auto-${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
}

export function automaticBackupsToDelete(files, keep = 30) {
  return files
    .filter((file) => automaticBackupTimestamp(file.name) !== null)
    .sort((left, right) => automaticBackupTimestamp(right.name) - automaticBackupTimestamp(left.name))
    .slice(keep)
}

export function routerFileTimestamp(file) {
  const automaticTimestamp = automaticBackupTimestamp(file.name)
  if (automaticTimestamp !== null) return automaticTimestamp

  for (const value of [file['last-modified'], file['creation-time']]) {
    if (typeof value !== 'string') continue
    const routerOsDate = /^([a-z]{3})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/i.exec(value)
    if (routerOsDate) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      const month = months.indexOf(routerOsDate[1].toLowerCase())
      if (month >= 0) {
        const timestamp = Date.UTC(
          Number(routerOsDate[3]),
          month,
          Number(routerOsDate[2]),
          Number(routerOsDate[4]),
          Number(routerOsDate[5]),
          Number(routerOsDate[6]),
        )
        if (Number.isFinite(timestamp)) return timestamp
      }
    }
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return timestamp
  }
  return 0
}
