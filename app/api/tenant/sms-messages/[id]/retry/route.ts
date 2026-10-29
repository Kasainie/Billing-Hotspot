import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { resendTenantSms } from '@/lib/db/tenant-sms'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'SMS message id is invalid.' }, { status: 400 })
  }
  try {
    const result = await resendTenantSms(session.tenantId, id)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
    if (result.status === 'failed') {
      return NextResponse.json({ error: result.error || 'Infobip rejected the message.' }, { status: 502 })
    }
    return NextResponse.json({
      id: result.id,
      status: result.status,
      message: result.status === 'sent' || result.status === 'pending' || result.status === 'delivered'
        ? 'Message resent successfully.'
        : 'Message resend queued. Delivery status will update in the report.',
    }, { status: result.status === 'sent' || result.status === 'pending' || result.status === 'delivered' ? 200 : 202 })
  } catch (error) {
    console.error('Failed to resend SMS', { tenantId: session.tenantId, messageId: id, error })
    return NextResponse.json({ error: 'Unable to resend this SMS.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
