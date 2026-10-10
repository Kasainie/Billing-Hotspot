import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { getTenantSession } from '@/lib/db/tenant'
import { calculateRouterHealth, isRouterOnline, parseRouterTimestamp } from '@/lib/router-monitoring'

type RouterRow = {
  id: string
  siteId: string
  siteName: string
  monitored: boolean
  routerName: string
  location: string
  lastSeenAt: Date | string | null
  connectorLastSeenAt: Date | string | null
  connectorEnabled: boolean
  lastSourceIp: string | null
  metricsUpdatedAt: Date | string | null
  cpuLoad: number | null
  freeMemoryBytes: number | null
  totalMemoryBytes: number | null
  freeDiskBytes: number | null
  totalDiskBytes: number | null
  activeHotspotUsers: number | null
  activePppoeUsers: number | null
  uptimeSeconds: number | null
  routerOsVersion: string | null
  boardName: string | null
  winboxEnabled: boolean | null
  winboxPort: number | null
  webEnabled: boolean | null
  webScheme: string | null
  webPort: number | null
}

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view workspace routers.' }, { status: 401 })

  try {
    const result = await db.execute<RouterRow>(sql`
      select
        monitor.id,
        monitor.site_id as "siteId",
        site.name as "siteName",
        true as monitored,
        monitor.router_name as "routerName",
        site.location,
        monitor.last_seen_at as "lastSeenAt",
        monitor.connector_last_seen_at as "connectorLastSeenAt",
        (monitor.connector_token_hash is not null) as "connectorEnabled",
        monitor.last_source_ip as "lastSourceIp",
        latest.sampled_at as "metricsUpdatedAt",
        latest.cpu_load as "cpuLoad",
        latest.free_memory_bytes::float8 as "freeMemoryBytes",
        latest.total_memory_bytes::float8 as "totalMemoryBytes",
        latest.free_disk_bytes::float8 as "freeDiskBytes",
        latest.total_disk_bytes::float8 as "totalDiskBytes",
        latest.active_hotspot_users as "activeHotspotUsers",
        latest.active_pppoe_users as "activePppoeUsers",
        latest.uptime_seconds::float8 as "uptimeSeconds",
        latest.router_os_version as "routerOsVersion",
        latest.board_name as "boardName",
        latest.winbox_enabled as "winboxEnabled",
        latest.winbox_port as "winboxPort",
        latest.web_enabled as "webEnabled",
        latest.web_scheme as "webScheme",
        latest.web_port as "webPort"
      from public.router_monitors as monitor
      inner join public.sites as site
        on site.id = monitor.site_id and site.tenant_id = monitor.tenant_id
      left join lateral (
        select sample.*
        from public.router_metric_samples as sample
        where sample.router_id = monitor.id
        order by sample.sampled_at desc
        limit 1
      ) as latest on true
      where monitor.tenant_id = ${session.tenantId}
        and monitor.enabled = true
      order by monitor.router_name
    `)
    const now = Date.now()
    const routers = result.rows.map((row) => {
      const lastSeenAt = parseRouterTimestamp(row.lastSeenAt)
      const connectorLastSeenAt = parseRouterTimestamp(row.connectorLastSeenAt)
      if (row.lastSeenAt !== null && !lastSeenAt) {
        console.error(`Invalid last-seen timestamp for router monitor ${row.id}`)
      }
      const online = isRouterOnline(lastSeenAt, now)
      const memoryUsedPercent = row.totalMemoryBytes && row.freeMemoryBytes !== null
        ? Math.max(0, Math.min(100, (1 - row.freeMemoryBytes / row.totalMemoryBytes) * 100))
        : null
      const diskUsedPercent = row.totalDiskBytes && row.freeDiskBytes !== null
        ? Math.max(0, Math.min(100, (1 - row.freeDiskBytes / row.totalDiskBytes) * 100))
        : null

      return {
        ...row,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        connectorLastSeenAt: connectorLastSeenAt?.toISOString() ?? null,
        status: online ? 'online' : 'offline',
        memoryUsedPercent,
        diskUsedPercent,
        health: calculateRouterHealth({
          online,
          cpuLoad: row.cpuLoad,
          freeMemoryBytes: row.freeMemoryBytes,
          totalMemoryBytes: row.totalMemoryBytes,
          freeDiskBytes: row.freeDiskBytes,
          totalDiskBytes: row.totalDiskBytes,
        }),
      }
    })
    const allRouters = routers.sort((left, right) => left.routerName.localeCompare(right.routerName))
    const onlineCount = routers.filter((router) => router.status === 'online').length

    return NextResponse.json({
      routers: allRouters,
      summary: {
        total: allRouters.length,
        online: onlineCount,
        offline: routers.length - onlineCount,
        lastUpdatedAt: new Date().toISOString(),
      },
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load workspace router monitors', error)
    return NextResponse.json({ error: 'Unable to load workspace router monitors.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
