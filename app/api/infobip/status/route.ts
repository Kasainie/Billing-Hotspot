import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getInfobipStatusCallbackToken, recordInfobipDeliveryReport } from '@/lib/db/tenant-sms'

function isValidCallbackToken(supplied: string, expected: string) {
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function valueAsText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId')?.trim() || ''
  const token = request.nextUrl.searchParams.get('token') || ''
  if (!tenantId || tenantId.length > 100 || !token) {
    return NextResponse.json({ error: 'Invalid Infobip callback.' }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid Infobip callback payload.' }, { status: 400 })
  }

  try {
    if (!isValidCallbackToken(token, getInfobipStatusCallbackToken(tenantId))) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }
    const body = asRecord(payload)
    const reports = Array.isArray(payload) ? payload : body?.results
    if (!Array.isArray(reports) || reports.length > 100) {
      return NextResponse.json({ error: 'Infobip callback must contain at most 100 delivery reports.' }, { status: 400 })
    }

    for (const rawReport of reports) {
      const report = asRecord(rawReport)
      const status = asRecord(report?.status)
      const providerMessageId = valueAsText(report?.messageId)
      const statusName = typeof report?.status === 'string'
        ? report.status
        : [status?.groupName, status?.name, status?.description]
          .map(valueAsText)
          .filter((value): value is string => value !== null)
          .join(' ')
      if (!providerMessageId || !statusName) continue
      const reportError = asRecord(report?.error)
      const matched = await recordInfobipDeliveryReport({
        tenantId,
        providerMessageId,
        status: statusName,
        errorCode: valueAsText(reportError?.id),
        errorMessage: valueAsText(reportError?.description) || valueAsText(reportError?.name),
      })
      if (!matched) console.error('Infobip delivery callback did not match a message', { tenantId, providerMessageId })
    }
    return NextResponse.json({ accepted: true })
  } catch (error) {
    console.error('Failed to process Infobip delivery callback', { tenantId, error })
    return NextResponse.json({ error: 'Unable to save Infobip delivery status.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
