import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSubscriberUsageRate,
  formatSubscriberSpeed,
  subscriberUsageChartScale,
} from './subscriber-usage.ts'

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

test('formats low non-zero rates in Kbps instead of rounding them to zero Mbps', () => {
  assert.deepEqual(formatSubscriberSpeed(0.00018), { value: '0.18', unit: 'Kbps' })
  assert.deepEqual(formatSubscriberSpeed(0.00001), { value: '0.01', unit: 'Kbps' })
  assert.deepEqual(formatSubscriberSpeed(0.000001), { value: '<0.01', unit: 'Kbps' })
  assert.deepEqual(formatSubscriberSpeed(0), { value: '0.00', unit: 'Mbps' })
  assert.deepEqual(formatSubscriberSpeed(1.236), { value: '1.24', unit: 'Mbps' })
})

test('scales the graph to recent traffic with a readable idle range', () => {
  assert.equal(subscriberUsageChartScale(0.00018), 0.0005)
  assert.equal(subscriberUsageChartScale(3), 5)
  assert.equal(subscriberUsageChartScale(0), 0.01)
})
