import { NextRequest, NextResponse } from 'next/server'
import { getTenantMemberships, getTenantSession } from '@/lib/db/tenant'

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 })
  try {
    const session = await getTenantSession(request)
    if (!session) return NextResponse.json({ user: null, tenant: null, memberships: [] }, { status: 401 })
    const memberships = await getTenantMemberships(session.userId)
    return NextResponse.json({
      user: { id: session.userId, name: session.name, email: session.email },
      tenant: { id: session.tenantId, name: session.tenantName, slug: session.tenantSlug, role: session.role },
      memberships,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to read tenant session', error)
    return NextResponse.json({ error: 'Unable to read the current session.' }, { status: 503 })
  }
}
