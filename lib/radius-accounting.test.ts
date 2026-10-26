import test from 'node:test'
import assert from 'node:assert/strict'
import { isRadiusAccountingFresh, RADIUS_ACCOUNTING_STALE_TIMEOUT_SECONDS } from './radius-accounting.ts'

test('RADIUS sessions go stale after missed one-minute interim updates', () => {
  const now = Date.parse('2026-10-25T09:00:00.000Z')
  const lastUpdate = new Date(now - 2 * 60_000)

  assert.equal(RADIUS_ACCOUNTING_STALE_TIMEOUT_SECONDS, 180)
  assert.equal(isRadiusAccountingFresh(lastUpdate, null, now), true)
  assert.equal(isRadiusAccountingFresh(new Date(now - 3 * 60_000), null, now), true)
  assert.equal(isRadiusAccountingFresh(new Date(now - 3 * 60_000 - 1), null, now), false)
  assert.equal(isRadiusAccountingFresh(null, new Date(now - 4 * 60_000), now), false)
  assert.equal(isRadiusAccountingFresh(null, null, now), false)
  assert.equal(isRadiusAccountingFresh('invalid', null, now), false)
})
