import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { hashRouterMonitorToken } from './router-monitoring.ts'
import {
  isRouterSessionId,
  matchesRouterConnectorToken,
  parseRouterConnectorCommandResults,
  parseRouterConnectorSessions,
  parseRouterConnectorTelemetry,
} from './router-connector.ts'

test('connector session reports accept valid Hotspot and PPPoE rows', () => {
  const sessions = parseRouterConnectorSessions([
    {
      sessionType: 'hotspot',
      routerSessionId: '*A',
      username: 'customer-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      ipAddress: '192.168.88.20',
      uptimeSeconds: 61,
    },
    {
      sessionType: 'pppoe',
      routerSessionId: '*B',
      username: 'account-42001',
      callerId: 'ether2',
      ipAddress: '2001:db8::5',
      uptimeSeconds: null,
    },
  ])

  assert.equal(sessions?.length, 2)
  assert.equal(sessions?.[0].sessionType, 'hotspot')
  assert.equal(sessions?.[1].ipAddress, '2001:db8::5')
})

test('connector rejects malformed, duplicate, or oversized sessions', () => {
  assert.equal(parseRouterConnectorSessions([{ sessionType: 'unknown' }]), null)
  assert.equal(parseRouterConnectorSessions([
    { sessionType: 'hotspot', routerSessionId: '*A', username: 'user' },
    { sessionType: 'hotspot', routerSessionId: '*A', username: 'user' },
  ]), null)
  assert.equal(parseRouterConnectorSessions([
    { sessionType: 'pppoe', routerSessionId: '*1', username: 'user', ipAddress: 'not-an-ip' },
  ]), null)
  assert.equal(parseRouterConnectorSessions(new Array(1001).fill({})), null)
  assert.equal(isRouterSessionId('1'), false)
  assert.equal(isRouterSessionId('*1'), true)
})

test('connector command results require a UUID and a boolean outcome', () => {
  const id = 'a5746f73-7b79-4c0e-a52c-9c057e3074f8'
  const claimToken = 'b5746f73-7b79-4c0e-a52c-9c057e3074f8'
  assert.deepEqual(parseRouterConnectorCommandResults([{ id, claimToken, succeeded: true }]), [
    { id, claimToken, succeeded: true, errorMessage: null },
  ])
  assert.equal(parseRouterConnectorCommandResults([{ id, claimToken, succeeded: 'yes' }]), null)
  assert.equal(parseRouterConnectorCommandResults([{ id, succeeded: true }]), null)
  assert.equal(parseRouterConnectorCommandResults([{ id: 'invalid', succeeded: false }]), null)
})

test('connector telemetry accepts valid router resource samples and rejects invalid counters', () => {
  const telemetry = {
    sampleId: 'c5746f73-7b79-4c0e-a52c-9c057e3074f8',
    cpuLoad: 18,
    freeMemoryBytes: 800,
    totalMemoryBytes: 1000,
    freeDiskBytes: 600,
    totalDiskBytes: 1000,
    totalRxBytes: 5000,
    totalTxBytes: 7000,
    activeHotspotUsers: 3,
    activePppoeUsers: 2,
    uptimeSeconds: 86400,
    routerOsVersion: '7.16.2',
    boardName: 'RB5009',
  }

  assert.deepEqual(parseRouterConnectorTelemetry(telemetry), telemetry)
  assert.equal(parseRouterConnectorTelemetry({ ...telemetry, freeMemoryBytes: 1001 }), null)
  assert.equal(parseRouterConnectorTelemetry({ ...telemetry, totalRxBytes: '5000' }), null)
  assert.equal(parseRouterConnectorTelemetry({ ...telemetry, freeDiskBytes: null }), null)
})

test('connector tokens are verified using their stored one-way hash', () => {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashRouterMonitorToken(token)
  assert.equal(matchesRouterConnectorToken(token, tokenHash), true)
  assert.equal(matchesRouterConnectorToken(randomBytes(32).toString('base64url'), tokenHash), false)
  assert.equal(matchesRouterConnectorToken(token, null), false)
})
