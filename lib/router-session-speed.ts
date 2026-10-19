const maxSampleAgeMs = 30_000

export function calculateSessionSpeedBps(
  currentBytes: bigint | null,
  previousBytes: bigint | null,
  intervalMs: number,
): bigint | null {
  if (currentBytes === null || previousBytes === null ||
      !Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > maxSampleAgeMs ||
      currentBytes < previousBytes) return null

  return (currentBytes - previousBytes) * BigInt(8_000) / BigInt(intervalMs)
}
