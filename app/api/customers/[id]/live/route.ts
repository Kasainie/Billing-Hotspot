import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, routerMonitors, routerRemoteSessions } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { serializeDatabaseTimestamp } from '@/lib/database-timestamp'

const customerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ActiveRadiusSession = {
  id: string
  ipAddress: string | null
  nasIpAddress: string | null
  macAddress: string | null
  callerId: string | null
  startedAt: Date | string | null
  lastAccountingAt: Date | string | null
  sessionSeconds: number | null
  downloadBytes: string | null
  uploadBytes: string | null
}

function totalKnownBytes<T extends { downloadBytes: string | null; uploadBytes: string | null }>(sessions: T[]) {
  if (!sessions.length || sessions.some((item) => item.downloadBytes === null || item.uploadBytes === null)) {
    return { downloadBytes: null, uploadBytes: null }
  }
  const totals = sessions.reduce((sum, item) => ({
    downloadBytes: sum.downloadBytes + BigInt(item.downloadBytes!),
    uploadBytes: sum.uploadBytes + BigInt(item.uploadBytes!),
  }), { downloadBytes: BigInt(0), uploadBytes: BigInt(0) })
  return { downloadBytes: totals.downloadBytes.toString(), uploadBytes: totals.uploadBytes.toString() }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view subscriber usage.' }, { status: 401 })

  const { id } = await context.params
  if (!customerIdPattern.test(id)) {
    return NextResponse.json({ error: 'Subscriber was not found.' }, { status: 404 })
  }

  try {
    const [customer] = await db.select({
      radiusUsername: customers.radiusUsername,
      siteId: customers.siteId,
    }).from(customers).where(and(
      eq(customers.id, id),
      eq(customers.tenantId, session.tenantId),
    )).limit(1)
    if (!customer) return NextResponse.json({ error: 'Subscriber was not found.' }, { status: 404 })

    const checkedAt = new Date().toISOString()
    const monitoredRouters = customer.siteId
      ? await db.select({
        id: routerMonitors.id,
        routerName: routerMonitors.routerName,
        connectorConfigured: routerMonitors.connectorTokenHash,
        connectorLastSeenAt: routerMonitors.connectorLastSeenAt,
      }).from(routerMonitors).where(and(
        eq(routerMonitors.tenantId, session.tenantId),
        eq(routerMonitors.siteId, customer.siteId),
        eq(routerMonitors.enabled, true),
      ))
      : []
    const onlineRouters = monitoredRouters.filter((router) =>
      router.connectorConfigured && router.connectorLastSeenAt &&
      Date.now() - router.connectorLastSeenAt.getTime() <= 30_000)
    const connectorState = !customer.siteId
      ? 'site-unassigned'
      : !monitoredRouters.length
        ? 'router-unavailable'
        : !monitoredRouters.some((router) => router.connectorConfigured)
          ? 'not-configured'
          : onlineRouters.length
            ? 'online'
            : 'offline'
    const connector = {
      state: connectorState,
      routerNames: monitoredRouters.map((router) => router.routerName),
      lastSeenAt: onlineRouters.reduce<Date | null>((latest, router) =>
        router.connectorLastSeenAt &&
        (!latest || router.connectorLastSeenAt.getTime() > latest.getTime())
          ? router.connectorLastSeenAt
          : latest, null)?.toISOString() ?? null,
    }
    if (customer.radiusUsername && customer.siteId) {
      const routerRows = await db.select({
        id: routerRemoteSessions.id,
        ipAddress: routerRemoteSessions.ipAddress,
        routerName: routerMonitors.routerName,
        macAddress: routerRemoteSessions.macAddress,
        callerId: routerRemoteSessions.callerId,
        startedAt: sql<Date | null>`case when ${routerRemoteSessions.uptimeSeconds} is null then null else clock_timestamp() - ${routerRemoteSessions.uptimeSeconds} * interval '1 second' end`,
        sessionSeconds: routerRemoteSessions.uptimeSeconds,
        downloadBytes: routerRemoteSessions.downloadBytes,
        uploadBytes: routerRemoteSessions.uploadBytes,
        observedAt: routerRemoteSessions.observedAt,
      }).from(routerRemoteSessions)
        .innerJoin(routerMonitors, eq(routerRemoteSessions.routerId, routerMonitors.id))
        .where(and(
          eq(routerRemoteSessions.username, customer.radiusUsername),
          eq(routerMonitors.tenantId, session.tenantId),
          eq(routerMonitors.siteId, customer.siteId),
          eq(routerMonitors.enabled, true),
          sql`${routerMonitors.connectorLastSeenAt} >= clock_timestamp() - interval '20 seconds'`,
          sql`${routerRemoteSessions.observedAt} >= clock_timestamp() - interval '20 seconds'`,
        ))
        .orderBy(sql`${routerRemoteSessions.observedAt} desc`)
        .limit(100)

      if (routerRows.length) {
        const observedAt = routerRows.reduce<Date | null>((latest, item) =>
          !latest || item.observedAt.getTime() > latest.getTime()
            ? item.observedAt
            : latest, null)
        const activeSessions = routerRows.map((item) => ({
          id: item.id,
          ipAddress: item.ipAddress,
          routerName: item.routerName,
          nasIpAddress: null,
          macAddress: item.macAddress,
          callerId: item.callerId,
          startedAt: serializeDatabaseTimestamp(item.startedAt),
          lastAccountingAt: null,
          sessionSeconds: item.sessionSeconds,
          downloadBytes: item.downloadBytes?.toString() ?? null,
          uploadBytes: item.uploadBytes?.toString() ?? null,
        }))
        return NextResponse.json({
          source: 'router',
          connector,
          liveIssue: activeSessions.some((item) => item.downloadBytes === null || item.uploadBytes === null)
            ? 'byte-counters-unavailable'
            : null,
          checkedAt,
          observedAt: serializeDatabaseTimestamp(observedAt),
          lastAccountingAt: null,
          activeSessions,
          ...totalKnownBytes(activeSessions),
        }, { headers: { 'cache-control': 'no-store, private' } })
      }
    }

    if (!customer.radiusUsername) {
      return NextResponse.json({
        source: 'unavailable',
        connector,
        liveIssue: 'username-unassigned',
        checkedAt,
        observedAt: null,
        lastAccountingAt: null,
        activeSessions: [],
        downloadBytes: null,
        uploadBytes: null,
      }, { headers: { 'cache-control': 'no-store, private' } })
    }

    const result = await db.execute<ActiveRadiusSession>(sql`
      select
        acctuniqueid as id,
        framedipaddress::text as "ipAddress",
        nasipaddress::text as "nasIpAddress",
        callingstationid as "macAddress",
        callingstationid as "callerId",
        acctstarttime as "startedAt",
        acctupdatetime as "lastAccountingAt",
        acctsessiontime as "sessionSeconds",
        coalesce(acctoutputoctets, 0)::text as "downloadBytes",
        coalesce(acctinputoctets, 0)::text as "uploadBytes"
      from public.radacct
      where username = ${customer.radiusUsername}
        and acctstoptime is null
        and acctstarttime is not null
      order by acctstarttime desc
      limit 100
    `)

    const activeSessions = result.rows.map((row) => ({
      id: row.id,
      ipAddress: row.ipAddress,
      nasIpAddress: row.nasIpAddress,
      macAddress: row.macAddress,
      callerId: row.callerId,
      startedAt: serializeDatabaseTimestamp(row.startedAt),
      lastAccountingAt: serializeDatabaseTimestamp(row.lastAccountingAt),
      sessionSeconds: row.sessionSeconds,
      downloadBytes: row.downloadBytes || '0',
      uploadBytes: row.uploadBytes || '0',
    }))
    const lastAccountingAt = activeSessions.reduce<string | null>((latest, item) => {
      if (!item.lastAccountingAt) return latest
      return !latest || item.lastAccountingAt > latest ? item.lastAccountingAt : latest
    }, null)
    const observedAt = activeSessions.reduce<string | null>((latest, item) =>
      item.lastAccountingAt && (!latest || item.lastAccountingAt > latest) ? item.lastAccountingAt : latest, null)

    return NextResponse.json({
      source: activeSessions.length ? 'radius' : 'unavailable',
      connector,
      liveIssue: connectorState === 'online'
        ? 'subscriber-session-not-found'
        : connectorState,
      checkedAt,
      observedAt,
      lastAccountingAt,
      activeSessions,
      ...totalKnownBytes(activeSessions),
    }, { headers: { 'cache-control': 'no-store, private' } })
  } catch (error) {
    console.error('Failed to load live subscriber usage', error)
    return NextResponse.json({ error: 'Unable to load live subscriber usage.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
