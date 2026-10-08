const durationLabels = new Map([
  [30 * 60, 'Valid for 30 minutes'],
  [60 * 60, 'Valid for 1 hour'],
  [4 * 60 * 60, 'Valid for 4 hours'],
  [6 * 60 * 60, 'Valid for 6 hours'],
  [12 * 60 * 60, 'Valid for 12 hours'],
  [24 * 60 * 60, 'Valid for 1 day'],
  [7 * 24 * 60 * 60, 'Valid for 7 days'],
  [30 * 24 * 60 * 60, 'Valid for 30 days'],
])

export type BillingPackage = {
  id: string
  name: string
  type?: string
  downloadMbps: number
  uploadMbps: number
  rateLimit?: string
  monthlyPrice: number
  durationSeconds: number
  devicesPerAccount: number
  burstLimit?: string | null
  burstThreshold?: string | null
  burstTimeSeconds?: number | null
  fupEnabled?: boolean
  fupLimitBytes?: number | null
  scheduleEnabled?: boolean
  scheduleSpec?: string | null
  nasRestrictions?: string[]
}

export function toHotspotProduct(plan: BillingPackage) {
  const durationSeconds = plan.durationSeconds || 30 * 24 * 60 * 60
  const rateLimit = plan.rateLimit || `${plan.uploadMbps}M/${plan.downloadMbps}M`
  return {
    id: plan.id,
    name: plan.name,
    type: plan.type || 'Hotspot',
    price: plan.monthlyPrice,
    durationSeconds,
    durationLabel: durationLabels.get(durationSeconds) || `Valid for ${Math.ceil(durationSeconds / 86400)} days`,
    rateLimit,
    speedLabel: `${rateLimit} Mbps`,
    devicesPerAccount: plan.devicesPerAccount || 1,
    burstLimit: plan.burstLimit || null,
    burstThreshold: plan.burstThreshold || null,
    burstTimeSeconds: plan.burstTimeSeconds || null,
    fupEnabled: plan.fupEnabled || false,
    fupLimitBytes: plan.fupLimitBytes || null,
    scheduleEnabled: plan.scheduleEnabled || false,
    scheduleSpec: plan.scheduleSpec || null,
    nasRestrictions: plan.nasRestrictions || [],
  }
}

export function toHotspotRadiusReplies(username: string, policy: Pick<BillingPackage,
  'durationSeconds' | 'devicesPerAccount' | 'rateLimit' | 'burstLimit' | 'burstThreshold' |
  'burstTimeSeconds' | 'fupEnabled' | 'fupLimitBytes'
>) {
  const replies = [
    { username, attribute: 'Session-Timeout', op: '=', value: String(policy.durationSeconds) },
    { username, attribute: 'Port-Limit', op: '=', value: String(policy.devicesPerAccount) },
  ]
  if (policy.rateLimit) {
    const rateLimitParts = [policy.rateLimit, policy.burstLimit, policy.burstThreshold, policy.burstTimeSeconds ? `${policy.burstTimeSeconds}/${policy.burstTimeSeconds}` : null].filter(Boolean)
    replies.push({ username, attribute: 'Mikrotik-Rate-Limit', op: '=', value: rateLimitParts.join(' ') })
  }
  if (policy.fupEnabled && policy.fupLimitBytes) {
    replies.push({ username, attribute: 'Mikrotik-Total-Limit', op: '=', value: String(policy.fupLimitBytes) })
  }
  return replies
}

export function toFreeRadiusExpiration(expiresAt: Date) {
  return expiresAt.toUTCString().replace(',', '').replace(' GMT', ' UTC')
}