export type SubscriberUsageCounters = {
  observedAt: string
  downloadBytes: string
  uploadBytes: string
}

export type SubscriberUsageRate = {
  downloadMbps: number
  uploadMbps: number
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
