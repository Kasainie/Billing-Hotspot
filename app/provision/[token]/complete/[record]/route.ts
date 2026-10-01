import { createHash } from 'node:crypto'
import { and, eq, gt, isNotNull } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { addRouterInventoryRecord } from '@/lib/router-provisioning'
import { routerProvisioningTokens } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(request: NextRequest, context: RouteContext<'/provision/[token]/complete/[record]'>) {
  const { token, record: recordKind } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response('Invalid provisioning token.', { status: 404 })

  const rawValue = await request.text()
  try {
    const [existing] = await db.select({ id: routerProvisioningTokens.id, routerData: routerProvisioningTokens.routerData })
      .from(routerProvisioningTokens)
      .where(and(
        eq(routerProvisioningTokens.tokenHash, hashToken(token)),
        gt(routerProvisioningTokens.expiresAt, new Date()),
        eq(routerProvisioningTokens.status, 'downloaded'),
        isNotNull(routerProvisioningTokens.configScript),
      ))
      .limit(1)
    if (!existing) return new Response('Provisioning token not found or expired.', { status: 404 })

    const routerData = addRouterInventoryRecord(existing.routerData, recordKind, rawValue)
    if (!routerData) return new Response('Invalid router inventory record.', { status: 400 })
    await db.update(routerProvisioningTokens)
      .set({ routerData })
      .where(eq(routerProvisioningTokens.id, existing.id))

    return new Response(null, {
      status: 204,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  } catch {
    return new Response('Unable to save router inventory record.', { status: 503 })
  }
}

export const dynamic = 'force-dynamic'