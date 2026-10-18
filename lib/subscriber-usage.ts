export type SubscriberUsageCounters = {
  observedAt: string
  downloadBytes: string
  uploadBytes: string
}

export type SubscriberUsageRate = {
  downloadMbps: number
  uploadMbps: number
}

export type FormattedSubscriberSpeed = {
  value: string
  unit: 'Mbps' | 'Kbps'
}

export function formatSubscriberSpeed(rateMbps: number): FormattedSubscriberSpeed {
  if (rateMbps > 0 && rateMbps < 0.01) {
    const rateKbps = rateMbps * 1000
    return {
      value: rateKbps < 0.01 ? '<0.01' : rateKbps < 1 ? rateKbps.toFixed(2) : rateKbps.toFixed(1),
      unit: 'Kbps',
    }
  }
  return { value: rateMbps.toFixed(2), unit: 'Mbps' }
}

export function subscriberUsageChartScale(peakRateMbps: number): number {
  if (!Number.isFinite(peakRateMbps) || peakRateMbps <= 0) return 0.01

  const target = peakRateMbps * 1.2
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const normalized = target / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

export function calculateSubscriberUsageRate(
  previous: SubscriberUsageCounters | null,
  current: SubscriberUsageCounters,
): SubscriberUsageRate | null {
  if (!previous) return null
  const previousAt = new Date(previous.observedAt).getTime()
  const currentAt = new Date(current.observedAt).getTime()
  const elapsedSeconds = (currentAt - previousAt) / 1000
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return null

  const previousDownload = BigInt(previous.downloadBytes)
  const currentDownload = BigInt(current.downloadBytes)
  const previousUpload = BigInt(previous.uploadBytes)
  const currentUpload = BigInt(current.uploadBytes)
  if (currentDownload < previousDownload || currentUpload < previousUpload) return null

  return {
    downloadMbps: Number(currentDownload - previousDownload) * 8 / elapsedSeconds / 1_000_000,
    uploadMbps: Number(currentUpload - previousUpload) * 8 / elapsedSeconds / 1_000_000,
  }
}
