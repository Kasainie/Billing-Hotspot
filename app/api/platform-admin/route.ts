import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantUsers, tenants } from '@/lib/db/schema'
import { requirePlatformAdmin } from '@/lib/platform-admin'

type TenantOverviewRow = {
  id: string
  name: string
  slug: string
  status: string
  createdAt: Date | string
  memberCount: number
  siteCount: number
  subscriberCount: number
  routerCount: number
}

const tenantIdPattern = /^(?:default|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export async function GET(request: NextRequest) {
  const access = await requirePlatformAdmin(request)
  if (access.response) return access.response
  const requestedTenantId = request.nextUrl.searchParams.get('tenantId')
  if (requestedTenantId && !tenantIdPattern.test(requestedTenantId)) {
    return NextResponse.json({ error: 'Tenant id is invalid.' }, { status: 400 })
  }

  try {
    const result = await db.execute<TenantOverviewRow>(sql`
      select
        tenant.id,
        tenant.name,
        tenant.slug,
        tenant.status,
        tenant.created_at as "createdAt",
        (select count(*)::int from public.tenant_memberships membership where membership.tenant_id = tenant.id) as "memberCount",
        (select count(*)::int from public.sites site where site.tenant_id = tenant.id) as "siteCount",
        (select count(*)::int from public.customers customer where customer.tenant_id = tenant.id) as "subscriberCount",
        (select count(*)::int from public.router_monitors router where router.tenant_id = tenant.id and router.enabled = true) as "routerCount"
      from public.tenants tenant
      order by tenant.created_at desc, tenant.name
    `)
    const tenantsList = result.rows
    let selectedTenant: { tenant: TenantOverviewRow; members: Array<{
      id: string
      userId: string
      name: string
      email: string
      emailVerified: boolean
      role: string
      createdAt: Date
    }> } | null = null

    if (requestedTenantId) {
      const tenant = tenantsList.find((item) => item.id === requestedTenantId)
      if (!tenant) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
      const members = await db.select({
        id: tenantMemberships.id,
        userId: tenantUsers.id,
        name: tenantUsers.name,
        email: tenantUsers.email,
        emailVerified: tenantUsers.emailVerified,
        role: tenantMemberships.role,
        createdAt: tenantMemberships.createdAt,
      }).from(tenantMemberships)
        .innerJoin(tenantUsers, eq(tenantUsers.id, tenantMemberships.userId))
        .where(eq(tenantMemberships.tenantId, requestedTenantId))
        .orderBy(tenantUsers.name)
      selectedTenant = { tenant, members }
    }

    return NextResponse.json({
      tenants: tenantsList,
      summary: {
        tenantCount: tenantsList.length,
        activeTenantCount: tenantsList.filter((item) => item.status === 'active').length,
        memberCount: tenantsList.reduce((sum, item) => sum + item.memberCount, 0),
        siteCount: tenantsList.reduce((sum, item) => sum + item.siteCount, 0),
        subscriberCount: tenantsList.reduce((sum, item) => sum + item.subscriberCount, 0),
        routerCount: tenantsList.reduce((sum, item) => sum + item.routerCount, 0),
      },
      selectedTenant,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load platform administration overview', error)
    return NextResponse.json({ error: 'Unable to load platform administration data.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requirePlatformAdmin(request)
  if (access.response) return access.response

  let input: { name?: unknown; slug?: unknown; ownerEmail?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Workspace details must be valid JSON.' }, { status: 400 })
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  const ownerEmail = typeof input.ownerEmail === 'string' ? input.ownerEmail.trim().toLowerCase() : ''
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return NextResponse.json({ error: 'Provide a valid workspace name, slug, and owner email.' }, { status: 400 })
  }

  try {
    const [owner] = await db.select({
      id: tenantUsers.id,
      emailVerified: tenantUsers.emailVerified,
    }).from(tenantUsers).where(eq(tenantUsers.email, ownerEmail)).limit(1)
    if (!owner) return NextResponse.json({ error: 'Create and verify the owner account before provisioning this workspace.' }, { status: 404 })
    if (!owner.emailVerified) return NextResponse.json({ error: 'The workspace owner must verify their email before assignment.' }, { status: 409 })

    const tenantId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(tenants).values({ id: tenantId, name, slug })
      await tx.insert(tenantMemberships).values({ tenantId, userId: owner.id, role: 'owner' })
    })
    return NextResponse.json({ id: tenantId, name, slug, ownerEmail }, { status: 201 })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'That workspace slug is already in use.' }, { status: 409 })
    }
    console.error('Failed to provision a platform tenant', error)
    return NextResponse.json({ error: 'Unable to provision the workspace.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
