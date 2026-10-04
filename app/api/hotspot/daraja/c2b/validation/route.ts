import { NextRequest, NextResponse } from 'next/server'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { authorizeC2bCallback } from '@/lib/mobile-money-callback'

export async function POST(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ ResultCode: '1', ResultDesc: 'Workspace not found.' }, { status: 404 })
  let payload: Record<string, unknown>
  try {
    payload = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Invalid payment callback.' }, { status: 400 })
  }

  try {
    const authorization = await authorizeC2bCallback(request, tenantId, payload)
    if (!authorization.ok) return NextResponse.json({ ResultCode: '1', ResultDesc: authorization.error }, { status: authorization.status })
    return NextResponse.json({ ResultCode: '0', ResultDesc: 'Accepted for reconciliation.' })
  } catch (error) {
    console.error('Unable to validate C2B payment callback', error)
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Unable to validate this payment.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
