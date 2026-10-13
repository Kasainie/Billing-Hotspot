import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerMonitors } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { getHotspotBundleScript, isValidProvisioningBaseUrl } from '@/lib/router-provisioning'

const routerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getTenantSession(_request)
  if (!session) return NextResponse.json({ error: 'Sign in to refresh router Hotspot files.' }, { status: 401 })

  const { id } = await context.params
  if (!routerIdPattern.test(id)) return NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 })

  let baseUrl: URL
  try {
    baseUrl = new URL(process.env.PROVISIONING_BASE_URL || 'https://billing.lktech.life')
  } catch {
    return NextResponse.json({ error: 'The application URL is invalid. Configure PROVISIONING_BASE_URL before refreshing Hotspot files.' }, { status: 503 })
  }
  if (!isValidProvisioningBaseUrl(baseUrl)) {
    return NextResponse.json({ error: 'The application URL must use HTTPS before refreshing Hotspot files.' }, { status: 503 })
  }

  try {
    const [monitor] = await db.select({ id: routerMonitors.id }).from(routerMonitors).where(and(
      eq(routerMonitors.id, id),
      eq(routerMonitors.tenantId, session.tenantId),
      eq(routerMonitors.enabled, true),
    )).limit(1)
    if (!monitor) return NextResponse.json({ error: 'Router not found in this workspace.' }, { status: 404 })

    const script = getHotspotBundleScript('hotspot-files.rsc', baseUrl.origin, session.tenantSlug)
    if (!script) throw new Error('Hotspot file refresh script is unavailable.')

    return NextResponse.json({ script }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to prepare router Hotspot file refresh', error)
    return NextResponse.json({ error: 'Unable to prepare the Hotspot file refresh script.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
