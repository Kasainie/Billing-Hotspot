import { createHash } from 'node:crypto'
import { and, eq, gt, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { routerProvisioningTokens } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function GET(_request: Request, context: RouteContext<'/provision/[token]/configure'>) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response('Configuration file not found or expired.', { status: 404 })

  try {
    const [record] = await db.select({ configScript: routerProvisioningTokens.configScript })
      .from(routerProvisioningTokens)
      .where(and(
        eq(routerProvisioningTokens.tokenHash, hashToken(token)),
        eq(routerProvisioningTokens.status, 'applied'),
        gt(routerProvisioningTokens.expiresAt, new Date()),
        isNotNull(routerProvisioningTokens.configScript),
      ))
      .limit(1)
    if (!record?.configScript) return new Response('Configuration file not found or expired.', { status: 404 })

    return new Response(record.configScript, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  } catch {
    return new Response('Unable to retrieve the configuration file.', { status: 503 })
  }
}

export const dynamic = 'force-dynamic'