import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenants } from '@/lib/db/schema'
import { requirePlatformAdmin } from '@/lib/platform-admin'

const tenantIdPattern = /^(?:default|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
const membershipIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tenantRoles = ['owner', 'admin', 'member'] as const
type TenantRole = typeof tenantRoles[number]

function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && tenantRoles.some((role) => role === value)
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ tenantId: string; membershipId: string }> }) {
  const access = await requirePlatformAdmin(request)
  if (access.response) return access.response
  const { tenantId, membershipId } = await context.params
  if (!tenantIdPattern.test(tenantId) || !membershipIdPattern.test(membershipId)) {
    return NextResponse.json({ error: 'Tenant or membership id is invalid.' }, { status: 400 })
  }

  let input: { role?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Membership role request must be valid JSON.' }, { status: 400 })
  }
  if (!isTenantRole(input.role)) {
    return NextResponse.json({ error: 'Choose owner, admin, or member.' }, { status: 400 })
  }
  const role = input.role

  try {
    const updated = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
        .where(eq(tenants.id, tenantId)).for('update').limit(1)
      if (!tenant) return { error: 'Tenant not found.', status: 404 }

      const [membership] = await tx.select({
        id: tenantMemberships.id,
        role: tenantMemberships.role,
      }).from(tenantMemberships).where(and(
        eq(tenantMemberships.id, membershipId),
        eq(tenantMemberships.tenantId, tenantId),
      )).limit(1)
      if (!membership) return { error: 'Workspace membership not found.', status: 404 }

      if (membership.role === 'owner' && role !== 'owner') {
        const [ownerCount] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(tenantMemberships).where(and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.role, 'owner'),
          ))
        if (ownerCount.count <= 1) return { error: 'A workspace must retain at least one owner.', status: 409 }
      }

      await tx.update(tenantMemberships).set({ role })
        .where(eq(tenantMemberships.id, membership.id))
      return { id: membership.id, role }
    })
    if ('error' in updated) return NextResponse.json({ error: updated.error }, { status: updated.status })
    return NextResponse.json(updated, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to update platform tenant membership', error)
    return NextResponse.json({ error: 'Unable to update the workspace membership.' }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ tenantId: string; membershipId: string }> }) {
  const access = await requirePlatformAdmin(request)
  if (access.response) return access.response
  const { tenantId, membershipId } = await context.params
  if (!tenantIdPattern.test(tenantId) || !membershipIdPattern.test(membershipId)) {
    return NextResponse.json({ error: 'Tenant or membership id is invalid.' }, { status: 400 })
  }

  try {
    const removed = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
        .where(eq(tenants.id, tenantId)).for('update').limit(1)
      if (!tenant) return { error: 'Tenant not found.', status: 404 }

      const [membership] = await tx.select({
        id: tenantMemberships.id,
        role: tenantMemberships.role,
      }).from(tenantMemberships).where(and(
        eq(tenantMemberships.id, membershipId),
        eq(tenantMemberships.tenantId, tenantId),
      )).limit(1)
      if (!membership) return { error: 'Workspace membership not found.', status: 404 }

      if (membership.role === 'owner') {
        const [ownerCount] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(tenantMemberships).where(and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.role, 'owner'),
          ))
        if (ownerCount.count <= 1) return { error: 'A workspace must retain at least one owner.', status: 409 }
      }

      await tx.delete(tenantMemberships).where(eq(tenantMemberships.id, membership.id))
      return { id: membership.id }
    })
    if ('error' in removed) return NextResponse.json({ error: removed.error }, { status: removed.status })
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to remove platform tenant membership', error)
    return NextResponse.json({ error: 'Unable to remove the workspace membership.' }, { status: 503 })
  }
}
