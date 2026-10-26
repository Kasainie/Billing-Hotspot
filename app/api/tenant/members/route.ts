import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantSession } from '@/lib/db/tenant'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { canManageTenant } from '@/lib/db/tenant-role-access'
import { tenantMemberships, tenantUsers, tenants } from '@/lib/db/schema'

const tenantRoles = ['owner', 'admin', 'member'] as const
type TenantRole = typeof tenantRoles[number]

function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && tenantRoles.some((role) => role === value)
}

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 })
  }
  let session
  try {
    session = await getTenantSession(request)
  } catch (error) {
    console.error('Failed to verify workspace staff access', error)
    return NextResponse.json({ error: 'Unable to verify workspace access.' }, { status: 503 })
  }
  if (!session) return NextResponse.json({ error: 'Sign in to view workspace staff.' }, { status: 401 })
  if (!canManageTenant(session.role)) {
    return NextResponse.json({ error: 'Workspace owner or admin access is required.' }, { status: 403 })
  }

  try {
    const members = await db.select({
      id: tenantMemberships.id,
      name: tenantUsers.name,
      email: tenantUsers.email,
      role: tenantMemberships.role,
      createdAt: tenantMemberships.createdAt,
    }).from(tenantMemberships)
      .innerJoin(tenantUsers, eq(tenantUsers.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, session.tenantId))
      .orderBy(tenantMemberships.createdAt)

    return NextResponse.json({ members }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load workspace staff', error)
    return NextResponse.json({ error: 'Unable to load workspace staff.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session

  let input: { email?: unknown; role?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Staff details must be valid JSON.' }, { status: 400 })
  }

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const role = input.role === undefined ? 'member' : input.role
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isTenantRole(role)) {
    return NextResponse.json({ error: 'Provide a valid email address and staff role.' }, { status: 400 })
  }
  if (session.role !== 'owner' && role !== 'member') {
    return NextResponse.json({ error: 'Only a workspace owner can assign admin or owner roles.' }, { status: 403 })
  }

  try {
    const [user] = await db.select({
      id: tenantUsers.id,
      emailVerified: tenantUsers.emailVerified,
    }).from(tenantUsers).where(sql`lower(${tenantUsers.email}) = ${email}`).limit(1)
    if (!user) {
      return NextResponse.json({ error: 'This account does not exist yet. Ask the person to sign up and verify their email, then try again.' }, { status: 404 })
    }
    if (!user.emailVerified) {
      return NextResponse.json({ error: 'This account must verify its email before you can add it to the workspace.' }, { status: 409 })
    }

    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
        .where(and(eq(tenants.id, session.tenantId), eq(tenants.status, 'active')))
        .for('update').limit(1)
      if (!tenant) return { kind: 'missing' as const }

      const [membership] = await tx.insert(tenantMemberships).values({
        tenantId: session.tenantId,
        userId: user.id,
        role,
      }).onConflictDoNothing().returning({ id: tenantMemberships.id })
      return membership ? { kind: 'added' as const } : { kind: 'duplicate' as const }
    })

    if (result.kind === 'missing') return NextResponse.json({ error: 'Workspace not found or unavailable.' }, { status: 404 })
    if (result.kind === 'duplicate') return NextResponse.json({ error: 'That account is already a member of this workspace.' }, { status: 409 })
    return NextResponse.json({ email, role }, { status: 201 })
  } catch (error) {
    console.error('Failed to add workspace staff member', error)
    return NextResponse.json({ error: 'Unable to add this staff member.' }, { status: 503 })
  }
}
