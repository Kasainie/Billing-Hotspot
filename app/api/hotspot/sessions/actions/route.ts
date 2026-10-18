import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { radcheck } from '@/lib/db/schema'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { tenantSessionUserFilter } from '@/lib/hotspot-session-tenant-filter'

export async function POST(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response

  let input: { action?: unknown; username?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (input.action !== 'suspend' ||
      typeof input.username !== 'string' ||
      !/^[a-zA-Z0-9._@-]{1,64}$/.test(input.username)) {
    return NextResponse.json({ error: 'Choose a valid active hotspot login to suspend.' }, { status: 400 })
  }

  const username = input.username
  const { tenantId } = access.session
  try {
    const activeAccount = await db.execute<{ username: string }>(sql`
      select accounting.username
      from public.radacct as accounting
      where accounting.username = ${username}
        and accounting.acctstoptime is null
        and ${tenantSessionUserFilter(tenantId)}
      limit 1
    `)
    if (!activeAccount.rows.length) {
      return NextResponse.json({ error: 'That active login is not available in this workspace.' }, { status: 404 })
    }

    await db.transaction(async (tx) => {
      await tx.delete(radcheck).where(and(
        eq(radcheck.tenantId, tenantId),
        eq(radcheck.username, username),
        eq(radcheck.attribute, 'Auth-Type'),
      ))
      await tx.insert(radcheck).values({
        tenantId,
        username,
        attribute: 'Auth-Type',
        op: ':=',
        value: 'Reject',
      })
    })
    return NextResponse.json({ status: 'suspended' })
  } catch (error) {
    console.error('Failed to suspend live hotspot login', error)
    return NextResponse.json({ error: 'Unable to suspend this hotspot login.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
