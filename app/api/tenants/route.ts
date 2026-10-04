import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantSessions, tenants } from '@/lib/db/schema'
import { getTenantMemberships, getTenantSession } from '@/lib/db/tenant'

function slugify(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63)
}

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view workspaces.' }, { status: 401 })
  try {
    return NextResponse.json(await getTenantMemberships(session.userId), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load tenant workspaces', error)
    return NextResponse.json({ error: 'Unable to load workspaces.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to create a workspace.' }, { status: 401 })

  let input: { name?: unknown; slug?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Workspace name is required.' }, { status: 400 })
  }
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const slug = slugify(typeof input.slug === 'string' && input.slug.trim() ? input.slug : name)
  if (name.length < 2 || name.length > 80 || !slug || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return NextResponse.json({ error: 'Provide a valid workspace name and slug.' }, { status: 400 })
  }

  const tenantId = randomUUID()
  try {
    await db.transaction(async (tx) => {
      await tx.insert(tenants).values({ id: tenantId, name, slug })
      await tx.insert(tenantMemberships).values({ tenantId, userId: session.userId, role: 'owner' })
      await tx.update(tenantSessions).set({ tenantId }).where(and(
        eq(tenantSessions.tokenHash, session.tokenHash),
        eq(tenantSessions.userId, session.userId),
      ))
    })
    return NextResponse.json({ id: tenantId, name, slug, role: 'owner' }, { status: 201 })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'That workspace slug is already in use.' }, { status: 409 })
    }
    console.error('Failed to create tenant workspace', error)
    return NextResponse.json({ error: 'Unable to create the workspace right now.' }, { status: 503 })
  }
}
