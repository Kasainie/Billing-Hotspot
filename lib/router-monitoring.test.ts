import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProvisioningScript } from './router-provisioning.ts'
import { buildRouterMonitorScript } from './router-monitor-script.ts'
import { calculateRouterHealth, getLiveRouterUptimeSeconds, isRouterOnline, parseRouterTimestamp, parseRouterUptime, ROUTER_ONLINE_TIMEOUT_MS } from './router-monitoring.ts'

test('the provisioning builder can include the optional legacy monitoring script', () => {
  const script = buildProvisioningScript({
    routerName: 'Office MikroTik',
    radiusServerAddress: '192.0.2.10',
    radiusSecret: 'this-is-a-valid-secret',
    completeUrl: 'https://billing.example.com/provision/token/complete',
    monitoring: {
      routerId: 'a5746f73-7b79-4c0e-a52c-9c057e3074f8',
      monitorToken: 'a'.repeat(43),
      telemetryUrl: 'https://billing.example.com/api/routers/telemetry',
    },
  })

  assert.match(script, /name="lktech-monitor" interval=1m/)
  assert.match(script, /\/api\/routers\/telemetry/)
  assert.ok(script.indexOf('name="lktech-monitor"') > script.indexOf('/import hotspot.rsc'))
})

test('router monitor setup installs an authenticated RouterOS heartbeat every minute', () => {
  const script = buildRouterMonitorScript({
    routerId: 'a5746f73-7b79-4c0e-a52c-9c057e3074f8',
    monitorToken: 'a'.repeat(43),
    telemetryUrl: 'https://billing.example.com/api/routers/telemetry',
  })

  assert.match(script, /interval=1m/)
  assert.match(script, /\/system script run lktech-monitor/)
  assert.match(script, /x-router-monitor-id/)
  assert.match(script, /x-router-monitor-token/)
  assert.match(script, /cpuLoad/)
  assert.match(script, /activeHotspotUsers/)
  assert.match(script, /activePppoeUsers/)
  assert.match(script, /totalRxBytes/)
  assert.match(script, /totalTxBytes/)
})

test('router monitor scripts reject invalid credentials and non-HTTPS production endpoints', () => {
  assert.throws(() => buildRouterMonitorScript({
    routerId: 'invalid',
    monitorToken: 'a'.repeat(43),
    telemetryUrl: 'https://billing.example.com/api/routers/telemetry',
  }), /credentials are invalid/)

  assert.throws(() => buildRouterMonitorScript({
    routerId: 'a5746f73-7b79-4c0e-a52c-9c057e3074f8',
    monitorToken: 'a'.repeat(43),
    telemetryUrl: 'http://billing.example.com/api/routers/telemetry',
  }), /requires HTTPS/)
})

test('RouterOS compact and clock-form uptime values convert to seconds', () => {
  assert.equal(parseRouterUptime('1w2d3h4m5s'), 788645)
  assert.equal(parseRouterUptime('2d03:04:05'), 183845)
  assert.equal(parseRouterUptime('00:01:00'), 60)
  assert.equal(parseRouterUptime('not-uptime'), null)
})

test('router timestamps accept Date and database string values and reject invalid values', () => {
  const timestamp = '2026-10-06T10:07:14.000Z'
  assert.equal(parseRouterTimestamp(timestamp)?.toISOString(), timestamp)
  assert.equal(parseRouterTimestamp(new Date(timestamp))?.toISOString(), timestamp)
  assert.equal(parseRouterTimestamp(null), null)
  assert.equal(parseRouterTimestamp('not-a-timestamp'), null)
})

test('router uptime advances from the latest heartbeat and stays fixed when offline', () => {
  const lastSeenAt = '2026-10-06T10:00:00.000Z'
  const now = Date.parse(lastSeenAt) + 23_000
  assert.equal(getLiveRouterUptimeSeconds(3120, lastSeenAt, now, true), 3143)
  assert.equal(getLiveRouterUptimeSeconds(3120, lastSeenAt, now, false), 3120)
  assert.equal(getLiveRouterUptimeSeconds(null, lastSeenAt, now, true), null)
})

test('router goes offline after missed monitoring intervals', () => {
  const lastSeenAt = '2026-10-06T10:00:00.000Z'
  const heartbeatTime = Date.parse(lastSeenAt)
  assert.equal(isRouterOnline(lastSeenAt, heartbeatTime), true)
  assert.equal(ROUTER_ONLINE_TIMEOUT_MS, 90_000)
  assert.equal(isRouterOnline(lastSeenAt, heartbeatTime + ROUTER_ONLINE_TIMEOUT_MS), true)
  assert.equal(isRouterOnline(lastSeenAt, heartbeatTime + ROUTER_ONLINE_TIMEOUT_MS + 1), false)
  assert.equal(isRouterOnline(null, heartbeatTime), false)
})

test('router health is unavailable offline and responds to resource pressure', () => {
  const healthy = calculateRouterHealth({
    online: true,
    cpuLoad: 10,
    freeMemoryBytes: 900,
    totalMemoryBytes: 1000,
    freeDiskBytes: 900,
    totalDiskBytes: 1000,
  })
  const pressured = calculateRouterHealth({
    online: true,
    cpuLoad: 100,
    freeMemoryBytes: 100,
    totalMemoryBytes: 1000,
    freeDiskBytes: 100,
    totalDiskBytes: 1000,
  })

  assert.equal(healthy, 100)
  assert.ok(pressured !== null && pressured < healthy)
  assert.equal(calculateRouterHealth({
    online: false,
    cpuLoad: 0,
    freeMemoryBytes: 900,
    totalMemoryBytes: 1000,
    freeDiskBytes: 900,
    totalDiskBytes: 1000,
  }), null)
})
