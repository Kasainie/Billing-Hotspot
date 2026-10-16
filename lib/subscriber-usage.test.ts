import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateSubscriberUsageRate } from './subscriber-usage.ts'

test('calculates subscriber transfer rates from consecutive router byte counters', () => {
  assert.deepEqual(calculateSubscriberUsageRate(
    { observedAt: '2026-10-16T12:00:00.000Z', downloadBytes: '1000000', uploadBytes: '500000' },
    { observedAt: '2026-10-16T12:00:10.000Z', downloadBytes: '3000000', uploadBytes: '1000000' },
  ), { downloadMbps: 1.6, uploadMbps: 0.4 })
})

test('reports zero while idle and rejects the first sample, invalid interval, or counter reset', () => {
  const sample = { observedAt: '2026-10-16T12:00:00.000Z', downloadBytes: '100', uploadBytes: '100' }
  assert.equal(calculateSubscriberUsageRate(null, sample), null)
  assert.deepEqual(calculateSubscriberUsageRate(sample, { ...sample, observedAt: '2026-10-16T12:00:01.000Z' }), {
    downloadMbps: 0,
    uploadMbps: 0,
  })
  assert.equal(calculateSubscriberUsageRate(
    { ...sample, observedAt: '2026-10-16T12:00:10.000Z', downloadBytes: '200' },
    sample,
  ), null)
})
