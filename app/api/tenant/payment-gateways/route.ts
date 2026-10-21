import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { listTenantPaymentGateways, saveTenantPaymentGateway, validatePaymentGatewayInput } from '@/lib/db/tenant-gateways'

export async function GET(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  try {
    const gateways = await listTenantPaymentGateways(access.session.tenantId)
    return NextResponse.json({ gateways }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Unable to load workspace payment gateways', error)
    return NextResponse.json({ error: 'Unable to load payment gateways.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payment gateway settings must be valid JSON.' }, { status: 400 })
  }
  const settings = validatePaymentGatewayInput(input)
  if (!settings) return NextResponse.json({ error: 'Choose a supported gateway and enter valid settings.' }, { status: 400 })
  try {
    await saveTenantPaymentGateway(access.session.tenantId, settings)
    return NextResponse.json({
      provider: settings.provider,
      environment: settings.environment,
      enabled: settings.enabled,
      message: 'Gateway credentials saved encrypted for this workspace.',
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Enter all required')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Unable to save workspace payment gateway', error)
    const message = error instanceof Error && error.message.startsWith('Enter all required')
      ? error.message
      : error instanceof Error && error.message.includes('TENANT_SECRETS_ENCRYPTION_KEY')
        ? 'Set TENANT_SECRETS_ENCRYPTION_KEY to a secure 32-byte key before saving payment credentials.'
        : 'Unable to save payment gateway settings.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
