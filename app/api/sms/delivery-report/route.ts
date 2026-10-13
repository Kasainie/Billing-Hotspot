import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { recordSmsDeliveryReport } from '@/lib/db/tenant-sms'

function stringValue(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export async function POST(request: NextRequest) {
  const secret = process.env.SMS_DELIVERY_REPORT_SECRET?.trim() || ''
  const supplied = request.nextUrl.searchParams.get('token') || ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    return NextResponse.json({ error: 'SMS delivery report authentication is not configured.' }, { status: 503 })
  }
  const matches = timingSafeEqual(
    Buffer.from(supplied.padEnd(secret.length).slice(0, secret.length)),
    Buffer.from(secret),
  ) && supplied.length === secret.length
  if (!matches) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  let payload: Record<string, unknown>
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      payload = await request.json() as Record<string, unknown>
    } else {
      const form = await request.formData()
      payload = Object.fromEntries(form.entries())
    }
  } catch {
    return NextResponse.json({ error: 'Invalid delivery report.' }, { status: 400 })
  }
  const providerMessageId = stringValue(payload.id, 200)
  const status = stringValue(payload.status, 120)
  if (!providerMessageId || !status) {
    return NextResponse.json({ error: 'Delivery report is missing its message id or status.' }, { status: 400 })
  }
  try {
    const matched = await recordSmsDeliveryReport({
      providerMessageId,
      status,
      networkCode: stringValue(payload.networkCode, 100) || null,
      failureReason: stringValue(payload.failureReason, 500) || null,
      retryCount: stringValue(payload.retryCount, 40) || null,
      cost: stringValue(payload.cost, 100) || null,
      requestId: stringValue(payload.requestId, 200) || null,
      bulkId: stringValue(payload.bulkId, 200) || null,
      linkId: stringValue(payload.linkId, 200) || null,
    })
    if (!matched) console.error('Africa’s Talking delivery report did not match an SMS', { providerMessageId })
    return NextResponse.json({ accepted: true })
  } catch (error) {
    console.error('Failed to save Africa’s Talking delivery report', { providerMessageId, error })
    return NextResponse.json({ error: 'Unable to save SMS delivery report.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
