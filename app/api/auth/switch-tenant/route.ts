import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantSessions, tenants } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'

export async function POST(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to select a workspace.' }, { status: 401 })

  let input: { tenantId?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Choose a valid workspace.' }, { status: 400 })
  }
  const tenantId = typeof input.tenantId === 'string' ? input.tenantId : ''
  try {
    const [membership] = await db.select({ tenantId: tenantMemberships.tenantId })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(and(eq(tenantMemberships.userId, session.userId), eq(tenantMemberships.tenantId, tenantId), eq(tenants.status, 'active')))
      .limit(1)
    if (!membership) return NextResponse.json({ error: 'You are not a member of that workspace.' }, { status: 403 })
    await db.update(tenantSessions).set({ tenantId }).where(eq(tenantSessions.tokenHash, session.tokenHash))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Failed to switch tenant workspace', error)
    return NextResponse.json({ error: 'Unable to switch workspaces right now.' }, { status: 503 })
  }
}
