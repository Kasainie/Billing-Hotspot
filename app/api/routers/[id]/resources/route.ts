import { and, eq, lt, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerConnectorQueries, routerMonitors } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { routerResourceNames } from '@/lib/router-connector'

const routerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const queryIdPattern = routerIdPattern

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view router resources.' }, { status: 401 })
  const { id } = await context.params
  if (!routerIdPattern.test(id)) return NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 })
  const queryId = request.nextUrl.searchParams.get('queryId') || ''
  if (!queryIdPattern.test(queryId)) return NextResponse.json({ error: 'Resource query id is invalid.' }, { status: 400 })

  try {
    const [query] = await db.select({
      id: routerConnectorQueries.id,
      resource: routerConnectorQueries.resource,
      status: routerConnectorQueries.status,
      result: routerConnectorQueries.result,
      errorMessage: routerConnectorQueries.errorMessage,
      createdAt: routerConnectorQueries.createdAt,
      completedAt: routerConnectorQueries.completedAt,
    }).from(routerConnectorQueries).innerJoin(routerMonitors, and(
      eq(routerMonitors.id, routerConnectorQueries.routerId),
      eq(routerMonitors.tenantId, session.tenantId),
    )).where(and(
      eq(routerConnectorQueries.id, queryId),
      eq(routerConnectorQueries.routerId, id),
    )).limit(1)
    if (!query) return NextResponse.json({ error: 'Router resource query was not found.' }, { status: 404 })
    return NextResponse.json({
      ...query,
      createdAt: query.createdAt.toISOString(),
      completedAt: query.completedAt?.toISOString() ?? null,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to read router resource query', error)
    return NextResponse.json({ error: 'Unable to read the router resource query.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to query router resources.' }, { status: 401 })
  const { id } = await context.params
  if (!routerIdPattern.test(id)) return NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 })

  let input: { resource?: unknown }
  try {
    input = await request.json() as { resource?: unknown }
  } catch {
    return NextResponse.json({ error: 'Router resource request must be valid JSON.' }, { status: 400 })
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.resource !== 'string' ||
      !routerResourceNames.includes(input.resource as typeof routerResourceNames[number])) {
    return NextResponse.json({ error: 'Choose a supported read-only router resource.' }, { status: 400 })
  }

  try {
    const now = new Date()
    const [monitor] = await db.select({
      id: routerMonitors.id,
      connectorTokenHash: routerMonitors.connectorTokenHash,
      connectorLastSeenAt: routerMonitors.connectorLastSeenAt,
    }).from(routerMonitors).where(and(
      eq(routerMonitors.id, id),
      eq(routerMonitors.tenantId, session.tenantId),
      eq(routerMonitors.enabled, true),
    )).limit(1)
    if (!monitor) return NextResponse.json({ error: 'Router not found in this workspace.' }, { status: 404 })
    if (!monitor.connectorTokenHash || !monitor.connectorLastSeenAt ||
        monitor.connectorLastSeenAt.getTime() < now.getTime() - 30_000) {
      return NextResponse.json({ error: 'The RouterOS API connector is offline. Start the connector to load live router resources.' }, { status: 409 })
    }

    await db.delete(routerConnectorQueries).where(and(
      eq(routerConnectorQueries.routerId, id),
      lt(routerConnectorQueries.createdAt, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
      or(
        eq(routerConnectorQueries.status, 'succeeded'),
        eq(routerConnectorQueries.status, 'failed'),
      ),
    ))
    const [query] = await db.insert(routerConnectorQueries).values({
      routerId: id,
      requestedBy: session.userId,
      resource: input.resource,
    }).returning({ id: routerConnectorQueries.id })
    return NextResponse.json({ queryId: query.id }, { status: 202, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to queue router resource query', error)
    return NextResponse.json({ error: 'Unable to query the router resource.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
