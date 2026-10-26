import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { sendSubscriberSms } from '@/lib/db/tenant-sms'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session

  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Subscriber id is invalid.' }, { status: 400 })
  }

  let input: { message?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter an SMS message to send.' }, { status: 400 })
  }
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (!message || message.length > 500) {
    return NextResponse.json({ error: 'SMS message must be between 1 and 500 characters.' }, { status: 400 })
  }

  try {
    const result = await sendSubscriberSms(session.tenantId, id, message)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
    return NextResponse.json({
      status: result.status,
      message: result.status === 'sent' ? 'SMS sent successfully.' : 'SMS queued for delivery. Check Communications for delivery status.',
    }, { status: result.status === 'sent' ? 200 : 202 })
  } catch (error) {
    console.error('Failed to send subscriber SMS', { tenantId: session.tenantId, customerId: id, error })
    return NextResponse.json({ error: 'Unable to send this SMS. Please try again.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
