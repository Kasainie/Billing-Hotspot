import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { tenantMemberships, tenants } from '@/lib/db/schema'

const membershipIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tenantRoles = ['owner', 'admin', 'member'] as const
type TenantRole = typeof tenantRoles[number]

function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && tenantRoles.some((role) => role === value)
}

type RouteContext = { params: Promise<{ membershipId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session
  const { membershipId } = await context.params
  if (!membershipIdPattern.test(membershipId)) {
    return NextResponse.json({ error: 'Membership id is invalid.' }, { status: 400 })
  }

  let input: { role?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Staff role request must be valid JSON.' }, { status: 400 })
  }
  if (!isTenantRole(input.role)) {
    return NextResponse.json({ error: 'Choose owner, admin, or member.' }, { status: 400 })
  }
  const role = input.role
  if (session.role !== 'owner' && role !== 'member') {
    return NextResponse.json({ error: 'Only a workspace owner can assign admin or owner roles.' }, { status: 403 })
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
        .where(and(eq(tenants.id, session.tenantId), eq(tenants.status, 'active')))
        .for('update').limit(1)
      if (!tenant) return { error: 'Workspace not found or unavailable.', status: 404 }

      const [membership] = await tx.select({
        id: tenantMemberships.id,
        userId: tenantMemberships.userId,
        role: tenantMemberships.role,
      }).from(tenantMemberships).where(and(
        eq(tenantMemberships.id, membershipId),
        eq(tenantMemberships.tenantId, session.tenantId),
      )).limit(1)
      if (!membership) return { error: 'Workspace staff member not found.', status: 404 }
      if (membership.userId === session.userId) {
        return { error: 'You cannot change your own workspace role.', status: 409 }
      }
      if (session.role !== 'owner' && membership.role !== 'member') {
        return { error: 'Only a workspace owner can manage admins or owners.', status: 403 }
      }

      if (membership.role === 'owner' && role !== 'owner') {
        const [ownerCount] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(tenantMemberships).where(and(
            eq(tenantMemberships.tenantId, session.tenantId),
            eq(tenantMemberships.role, 'owner'),
          ))
        if (ownerCount.count <= 1) return { error: 'A workspace must retain at least one owner.', status: 409 }
      }

      await tx.update(tenantMemberships).set({ role })
        .where(eq(tenantMemberships.id, membership.id))
      return { id: membership.id, role }
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to update workspace staff role', error)
    return NextResponse.json({ error: 'Unable to update this staff role.' }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session
  const { membershipId } = await context.params
  if (!membershipIdPattern.test(membershipId)) {
    return NextResponse.json({ error: 'Membership id is invalid.' }, { status: 400 })
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
        .where(and(eq(tenants.id, session.tenantId), eq(tenants.status, 'active')))
        .for('update').limit(1)
      if (!tenant) return { error: 'Workspace not found or unavailable.', status: 404 }

      const [membership] = await tx.select({
        id: tenantMemberships.id,
        userId: tenantMemberships.userId,
        role: tenantMemberships.role,
      }).from(tenantMemberships).where(and(
        eq(tenantMemberships.id, membershipId),
        eq(tenantMemberships.tenantId, session.tenantId),
      )).limit(1)
      if (!membership) return { error: 'Workspace staff member not found.', status: 404 }
      if (membership.userId === session.userId) {
        return { error: 'You cannot remove your own workspace access.', status: 409 }
      }
      if (session.role !== 'owner' && membership.role !== 'member') {
        return { error: 'Only a workspace owner can remove admins or owners.', status: 403 }
      }

      if (membership.role === 'owner') {
        const [ownerCount] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(tenantMemberships).where(and(
            eq(tenantMemberships.tenantId, session.tenantId),
            eq(tenantMemberships.role, 'owner'),
          ))
        if (ownerCount.count <= 1) return { error: 'A workspace must retain at least one owner.', status: 409 }
      }

      await tx.delete(tenantMemberships).where(eq(tenantMemberships.id, membership.id))
      return { id: membership.id }
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to remove workspace staff member', error)
    return NextResponse.json({ error: 'Unable to remove this staff member.' }, { status: 503 })
  }
}
