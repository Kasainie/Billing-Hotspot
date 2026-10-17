import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantUsers, tenants } from '@/lib/db/schema'
import { requirePlatformAdmin } from '@/lib/platform-admin'

const tenantIdPattern = /^(?:default|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export async function POST(request: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  const access = await requirePlatformAdmin(request)
  if (access.response) return access.response
  const { tenantId } = await context.params
  if (!tenantIdPattern.test(tenantId)) return NextResponse.json({ error: 'Tenant id is invalid.' }, { status: 400 })

  let input: { email?: unknown; role?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Membership details must be valid JSON.' }, { status: 400 })
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const role = input.role === undefined ? 'member' : input.role
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof role !== 'string' || !['owner', 'admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Provide a valid account email and membership role.' }, { status: 400 })
  }

  try {
    const [user] = await db.select({
      id: tenantUsers.id,
      emailVerified: tenantUsers.emailVerified,
    }).from(tenantUsers).where(eq(tenantUsers.email, email)).limit(1)
    if (!user) return NextResponse.json({ error: 'Create and verify the account before assigning it to a workspace.' }, { status: 404 })
    if (!user.emailVerified) return NextResponse.json({ error: 'The account must verify its email before workspace assignment.' }, { status: 409 })

    const added = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
        .where(eq(tenants.id, tenantId)).for('update').limit(1)
      if (!tenant) return { kind: 'missing' as const }
      const [membership] = await tx.insert(tenantMemberships).values({
        tenantId,
        userId: user.id,
        role,
      }).onConflictDoNothing().returning({ id: tenantMemberships.id })
      return membership ? { kind: 'added' as const, id: membership.id } : { kind: 'duplicate' as const }
    })
    if (added.kind === 'missing') return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
    if (added.kind === 'duplicate') return NextResponse.json({ error: 'That account is already a member of this workspace.' }, { status: 409 })
    return NextResponse.json({ id: added.id, email, role }, { status: 201 })
  } catch (error) {
    console.error('Failed to add a platform tenant membership', error)
    return NextResponse.json({ error: 'Unable to add the workspace member.' }, { status: 503 })
  }
}
