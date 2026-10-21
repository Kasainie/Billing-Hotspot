import { NextRequest, NextResponse } from 'next/server'
import { hasTenantDarajaConfiguration } from '@/lib/db/tenant-payments'
import { listTenantPaymentGateways } from '@/lib/db/tenant-gateways'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { paymentGatewayDefinitions } from '@/lib/payment-gateways'

export async function GET(request: NextRequest) {
  try {
    const tenantId = await resolvePublicTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } })
    const [darajaConfigured, gateways] = await Promise.all([
      hasTenantDarajaConfiguration(tenantId),
      listTenantPaymentGateways(tenantId),
    ])
    const methods = [
      ...(darajaConfigured ? [{ provider: 'daraja', name: 'M-Pesa' }] : []),
      ...gateways.filter((gateway) => paymentGatewayDefinitions[gateway.provider as keyof typeof paymentGatewayDefinitions]?.available &&
        gateway.enabled && gateway.requiredSecrets.every((key) => gateway.configuredSecrets.includes(key)))
        .map(({ provider, name }) => ({ provider, name })),
    ]
    return NextResponse.json({ methods }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Unable to load customer payment methods', error)
    return NextResponse.json({ error: 'Payment methods are temporarily unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}

export const dynamic = 'force-dynamic'
