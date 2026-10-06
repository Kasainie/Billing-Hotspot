import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { calculateRouterHealth, parseRouterTimestamp } from '@/lib/router-monitoring'

type RouterRow = {
  id: string
  siteId: string
  monitored: boolean
  routerName: string
  location: string
  lastSeenAt: Date | string | null
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
}

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view workspace routers.' }, { status: 401 })

  try {
    const result = await db.execute<RouterRow>(sql`
      select
        monitor.id,
        monitor.site_id as "siteId",
        true as monitored,
        monitor.router_name as "routerName",
        site.location,
        monitor.last_seen_at as "lastSeenAt",
        latest.cpu_load as "cpuLoad",
        latest.free_memory_bytes::float8 as "freeMemoryBytes",
        latest.total_memory_bytes::float8 as "totalMemoryBytes",
        latest.free_disk_bytes::float8 as "freeDiskBytes",
        latest.total_disk_bytes::float8 as "totalDiskBytes",
        latest.active_hotspot_users as "activeHotspotUsers",
        latest.active_pppoe_users as "activePppoeUsers",
        latest.uptime_seconds::float8 as "uptimeSeconds",
        latest.router_os_version as "routerOsVersion",
        latest.board_name as "boardName"
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
    const sitesInWorkspace = await db.select({
      id: sites.id,
      name: sites.name,
      location: sites.location,
    }).from(sites).where(eq(sites.tenantId, session.tenantId))

    const now = Date.now()
    const monitoredSiteIds = new Set(result.rows.map((row) => row.siteId))
    const routers = result.rows.map((row) => {
      const lastSeenAt = parseRouterTimestamp(row.lastSeenAt)
      if (row.lastSeenAt !== null && !lastSeenAt) {
        console.error(`Invalid last-seen timestamp for router monitor ${row.id}`)
      }
      const online = lastSeenAt !== null && now - lastSeenAt.getTime() <= 3 * 60 * 1000
      const memoryUsedPercent = row.totalMemoryBytes && row.freeMemoryBytes !== null
        ? Math.max(0, Math.min(100, (1 - row.freeMemoryBytes / row.totalMemoryBytes) * 100))
        : null
      const diskUsedPercent = row.totalDiskBytes && row.freeDiskBytes !== null
        ? Math.max(0, Math.min(100, (1 - row.freeDiskBytes / row.totalDiskBytes) * 100))
        : null

      return {
        ...row,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
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
    const unmonitoredSites = sitesInWorkspace
      .filter((site) => !monitoredSiteIds.has(site.id))
      .map((site) => ({
        id: site.id,
        siteId: site.id,
        monitored: false,
        routerName: site.name,
        location: site.location,
        lastSeenAt: null,
        cpuLoad: null,
        freeMemoryBytes: null,
        totalMemoryBytes: null,
        freeDiskBytes: null,
        totalDiskBytes: null,
        activeHotspotUsers: null,
        activePppoeUsers: null,
        uptimeSeconds: null,
        routerOsVersion: null,
        boardName: null,
        status: 'not_configured',
        memoryUsedPercent: null,
        diskUsedPercent: null,
        health: null,
      }))
    const allRouters = [...routers, ...unmonitoredSites].sort((left, right) => left.routerName.localeCompare(right.routerName))
    const onlineCount = routers.filter((router) => router.status === 'online').length

    return NextResponse.json({
      routers: allRouters,
      summary: {
        total: allRouters.length,
        online: onlineCount,
        offline: routers.length - onlineCount,
        notConfigured: unmonitoredSites.length,
        lastUpdatedAt: new Date().toISOString(),
      },
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load workspace router monitors', error)
    return NextResponse.json({ error: 'Unable to load workspace router monitors.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
