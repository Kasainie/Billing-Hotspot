import { NextRequest, NextResponse } from 'next/server'
import { processGatewayNotification } from '@/lib/db/process-gateway-notification'

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('OrderMerchantReference') || ''
  const providerReference = request.nextUrl.searchParams.get('OrderTrackingId') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference) || !providerReference) {
    return NextResponse.json({ error: 'Invalid payment notification.' }, { status: 400 })
  }
  try {
    await processGatewayNotification({ reference, providerReference, provider: 'pesapal' })
    return NextResponse.json({ status: 200 })
  } catch (error) {
    console.error('Unable to verify Pesapal payment notification', error)
    return NextResponse.json({ error: 'Payment notification could not be verified.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
