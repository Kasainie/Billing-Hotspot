export function serializeDatabaseTimestamp(value: Date | string | null) {
  if (value === null) return null
  const timestamp = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(timestamp.getTime())) {
    throw new RangeError('Invalid database timestamp')
  }
  return timestamp.toISOString()
}
