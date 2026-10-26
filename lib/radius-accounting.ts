import { sql, type SQL } from 'drizzle-orm'

export const RADIUS_ACCOUNTING_STALE_TIMEOUT_SECONDS = 180

export function radiusAccountingFreshnessPredicate(lastUpdatedAt: SQL, startedAt: SQL) {
  return sql`coalesce(${lastUpdatedAt}, ${startedAt}) >= clock_timestamp() - ${RADIUS_ACCOUNTING_STALE_TIMEOUT_SECONDS} * interval '1 second'`
}

export function isRadiusAccountingFresh(
  lastUpdatedAt: Date | string | null,
  startedAt: Date | string | null,
  now: number,
) {
  const timestamp = lastUpdatedAt ?? startedAt
  if (timestamp === null) return false
  const eventTime = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
  return Number.isFinite(eventTime) && now - eventTime <= RADIUS_ACCOUNTING_STALE_TIMEOUT_SECONDS * 1_000
}
