export const DEFAULT_OFFICIAL_RECORDS_START_AT = '2026-10-29T00:00:00+03:00'

export function getOfficialRecordsCutoff() {
  const configured = process.env.OFFICIAL_RECORDS_START_AT?.trim()
  const parsed = new Date(configured || DEFAULT_OFFICIAL_RECORDS_START_AT)
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_OFFICIAL_RECORDS_START_AT) : parsed
}
