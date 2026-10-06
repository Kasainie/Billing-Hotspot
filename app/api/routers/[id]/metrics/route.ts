import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { getTenantSession } from '@/lib/db/tenant'
import { parseRouterTimestamp } from '@/lib/router-monitoring'

const ranges = {
  '1h': { duration: '1 hour', bucket: '1 minute' },
  '24h': { duration: '24 hours', bucket: '1 minute' },
  '7d': { duration: '7 days', bucket: '1 hour' },
  '30d': { duration: '30 days', bucket: '3 hours' },
} as const

type MetricBucket = {
  sampledAt: Date | string
  cpuLoad: number
  freeMemoryBytes: number
  totalMemoryBytes: number
  freeDiskBytes: number | null
  totalDiskBytes: number | null
  totalRxBytes: number | null
  totalTxBytes: number | null
  activeHotspotUsers: number
  activePppoeUsers: number
  uptimeSeconds: number
  routerOsVersion: string | null
  boardName: string | null
  temperatureCelsius: number | null
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view router monitoring history.' }, { status: 401 })
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 })
  }
  const rangeName = request.nextUrl.searchParams.get('range') || '24h'
  if (!Object.hasOwn(ranges, rangeName)) return NextResponse.json({ error: 'Select a valid monitoring range.' }, { status: 400 })
  const range = ranges[rangeName as keyof typeof ranges]

  try {
    const rows = await db.execute<MetricBucket>(sql`
      select
        date_bin(${range.bucket}::interval, sample.sampled_at, timestamptz '2000-01-01 00:00:00+00') as "sampledAt",
        round(avg(sample.cpu_load))::int as "cpuLoad",
        avg(sample.free_memory_bytes)::float8 as "freeMemoryBytes",
        avg(sample.total_memory_bytes)::float8 as "totalMemoryBytes",
        avg(sample.free_disk_bytes)::float8 as "freeDiskBytes",
        avg(sample.total_disk_bytes)::float8 as "totalDiskBytes",
        max(sample.total_rx_bytes)::float8 as "totalRxBytes",
        max(sample.total_tx_bytes)::float8 as "totalTxBytes",
        round(avg(sample.active_hotspot_users))::int as "activeHotspotUsers",
        round(avg(sample.active_pppoe_users))::int as "activePppoeUsers",
        avg(sample.uptime_seconds)::float8 as "uptimeSeconds",
        max(sample.router_os_version) as "routerOsVersion",
        max(sample.board_name) as "boardName",
        round(avg(sample.temperature_celsius))::int as "temperatureCelsius"
      from public.router_metric_samples as sample
      inner join public.router_monitors as monitor on monitor.id = sample.router_id
      where monitor.id = ${id}
        and monitor.tenant_id = ${session.tenantId}
        and sample.sampled_at >= now() - ${range.duration}::interval
      group by 1
      order by 1 asc
    `)
    return NextResponse.json({
      range: rangeName,
      samples: rows.rows.flatMap((row) => {
        const sampledAt = parseRouterTimestamp(row.sampledAt)
        if (!sampledAt) {
          console.error('Invalid sampled-at timestamp in router monitoring history')
          return []
        }
        return [{
          ...row,
          sampledAt: sampledAt.toISOString(),
          memoryUsedPercent: row.totalMemoryBytes > 0
            ? Math.max(0, Math.min(100, (1 - row.freeMemoryBytes / row.totalMemoryBytes) * 100))
            : null,
          diskUsedPercent: row.totalDiskBytes && row.freeDiskBytes !== null
            ? Math.max(0, Math.min(100, (1 - row.freeDiskBytes / row.totalDiskBytes) * 100))
            : null,
        }]
      }),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load router monitoring history', error)
    return NextResponse.json({ error: 'Unable to load router monitoring history.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
