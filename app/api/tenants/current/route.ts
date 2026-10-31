import { and, eq, ne } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPortalSettings, tenants } from '@/lib/db/schema'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'

export async function PATCH(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session

  let input: { name?: unknown; slug?: unknown; portalName?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const requestedName = typeof input.name === 'string' ? input.name.trim() : ''
  const requestedSlug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  const portalName = typeof input.portalName === 'string' ? input.portalName.trim() : ''
  if (requestedName && (requestedName.length < 2 || requestedName.length > 80 || /[\u0000-\u001f\u007f]/.test(requestedName))) return NextResponse.json({ error: 'ISP or account name must be 2 to 80 characters.' }, { status: 400 })
  if (requestedSlug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedSlug) || requestedSlug.length > 63)) return NextResponse.json({ error: 'Workspace address must use lowercase letters, numbers, and hyphens.' }, { status: 400 })
  if (portalName && (portalName.length < 2 || portalName.length > 48 || /[\u0000-\u001f\u007f]/.test(portalName))) return NextResponse.json({ error: 'Captive portal name must be 2 to 48 characters.' }, { status: 400 })
  if (!requestedName && !requestedSlug && !portalName) return NextResponse.json({ error: 'Provide a workspace name or portal setting to update.' }, { status: 400 })

  try {
    const [currentTenant] = await db.select({ name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1)
    if (!currentTenant) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
    const name = requestedName || currentTenant.name
    const slug = requestedSlug || currentTenant.slug
    const [conflict] = await db.select({ id: tenants.id }).from(tenants)
      .where(and(eq(tenants.slug, slug), ne(tenants.id, session.tenantId))).limit(1)
    if (conflict) return NextResponse.json({ error: 'That workspace address is already in use.' }, { status: 409 })

    await db.transaction(async (tx) => {
      await tx.update(tenants).set({ name, slug }).where(eq(tenants.id, session.tenantId))
      if (portalName) {
        await tx.insert(hotspotPortalSettings).values({
          tenantId: session.tenantId,
          id: 1,
          companyName: portalName,
        }).onConflictDoUpdate({
          target: [hotspotPortalSettings.tenantId, hotspotPortalSettings.id],
          set: { companyName: portalName, updatedAt: new Date() },
        })
      }
    })

    return NextResponse.json({ name, slug, portalName })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'That workspace address is already in use.' }, { status: 409 })
    }
    console.error('Failed to update workspace onboarding profile', error)
    return NextResponse.json({ error: 'Unable to save the ISP profile.' }, { status: 503 })
  }
}
