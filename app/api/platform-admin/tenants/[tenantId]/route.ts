import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenants } from '@/lib/db/schema'
import { requirePlatformAdmin } from '@/lib/platform-admin'

const tenantIdPattern = /^(?:default|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export async function PATCH(request: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  const access = await requirePlatformAdmin(request)
  if (access.response) return access.response
  const { tenantId } = await context.params
  if (!tenantIdPattern.test(tenantId)) return NextResponse.json({ error: 'Tenant id is invalid.' }, { status: 400 })

  let input: { status?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Tenant status request must be valid JSON.' }, { status: 400 })
  }
  if (input.status !== 'active' && input.status !== 'suspended') {
    return NextResponse.json({ error: 'Choose active or suspended status.' }, { status: 400 })
  }
  if (tenantId === access.session.tenantId) {
    return NextResponse.json({ error: 'Switch to another active workspace before changing this workspace status.' }, { status: 409 })
  }

  try {
    const [tenant] = await db.update(tenants).set({ status: input.status })
      .where(eq(tenants.id, tenantId))
      .returning({ id: tenants.id, status: tenants.status })
    if (!tenant) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
    return NextResponse.json(tenant, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to update platform tenant status', error)
    return NextResponse.json({ error: 'Unable to update the workspace status.' }, { status: 503 })
  }
}
