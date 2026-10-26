import { and, count, eq, gt, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { initiateStkPush } from '@/lib/daraja'
import { normalizeKenyanPhoneInput } from '@/lib/kenyan-phone'
import { db } from '@/lib/db'
import { packages, pppoeAccounts, pppoePayments, tenants } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { getTenantDarajaConfiguration } from '@/lib/db/tenant-payments'
import { getTenantPaymentGateway } from '@/lib/db/tenant-gateways'
import { createHostedCheckout } from '@/lib/payment-gateway-client'
import { isPaymentGatewayProvider, type PaymentGatewayProvider } from '@/lib/payment-gateways'

export async function POST(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })

  let input: { name?: unknown; email?: unknown; phone?: unknown; packageId?: unknown; provider?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter your details and choose a PPPoE package.' }, { status: 400 })
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const phone = typeof input.phone === 'string' ? normalizeKenyanPhoneInput(input.phone) : null
  const packageId = typeof input.packageId === 'string' ? input.packageId : ''
  const requestedProvider = input.provider ?? 'daraja'
  const provider = requestedProvider === 'daraja' || isPaymentGatewayProvider(requestedProvider) ? requestedProvider as PaymentGatewayProvider | 'daraja' : null
  if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !phone ||
      !provider || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packageId)) {
    return NextResponse.json({ error: 'Enter valid customer details, a phone number starting with 07 followed by 8 digits or +254 followed by 9 digits, a payment method, and a PPPoE package.' }, { status: 400 })
  }
  if (provider === 'airtel-money') return NextResponse.json({ error: 'Airtel Money checkout is not available yet.' }, { status: 400 })

  try {
    let darajaConfiguration
    let gatewayConfiguration
    if (provider === 'daraja') {
      darajaConfiguration = await getTenantDarajaConfiguration(tenantId)
      if (!darajaConfiguration) return NextResponse.json({ error: 'M-Pesa payments are not available yet. Please contact customer care.' }, { status: 503 })
    } else {
      gatewayConfiguration = await getTenantPaymentGateway(tenantId, provider)
      if (!gatewayConfiguration) return NextResponse.json({ error: 'That payment method is not enabled for this workspace.' }, { status: 400 })
    }
    const [plan] = await db.select({
      id: packages.id,
      name: packages.name,
      type: packages.type,
      rateLimit: packages.rateLimit,
      monthlyPrice: packages.monthlyPrice,
      durationSeconds: packages.durationSeconds,
      devicesPerAccount: packages.devicesPerAccount,
    }).from(packages).where(and(
      eq(packages.id, packageId),
      eq(packages.tenantId, tenantId),
      eq(packages.type, 'PPPoE'),
      eq(packages.active, true),
      eq(packages.availability, 'live'),
      eq(packages.listed, true),
    )).limit(1)
    if (!plan) return NextResponse.json({ error: 'This PPPoE package is no longer available. Refresh and try again.' }, { status: 404 })
    if (plan.monthlyPrice <= 0) return NextResponse.json({ error: 'Free PPPoE packages cannot be purchased through checkout.' }, { status: 400 })

    const accountNumber = await db.transaction(async (tx) => {
      const [created] = await tx.insert(pppoeAccounts).values({ tenantId, phone, name, email })
        .onConflictDoNothing({ target: [pppoeAccounts.tenantId, pppoeAccounts.phone] })
        .returning({ accountNumber: pppoeAccounts.accountNumber })
      const [account] = created ? [created] : await tx.select({
        accountNumber: pppoeAccounts.accountNumber,
      }).from(pppoeAccounts).where(and(eq(pppoeAccounts.phone, phone), eq(pppoeAccounts.tenantId, tenantId))).limit(1)
      if (!account) throw new Error('Unable to create a PPPoE customer account.')

      const [recent] = await tx.select({ total: count() }).from(pppoePayments).where(and(
        eq(pppoePayments.accountNumber, account.accountNumber),
        eq(pppoePayments.tenantId, tenantId),
        gt(pppoePayments.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
        inArray(pppoePayments.status, ['initiating', 'pending']),
      ))
      if ((recent?.total || 0) >= 3) throw new Error('There are already several payment attempts for this account. Wait a few minutes and try again.')

      const [payment] = await tx.insert(pppoePayments).values({
        tenantId,
        accountNumber: account.accountNumber,
        productId: plan.id,
        productName: plan.name,
        durationSeconds: plan.durationSeconds,
        amount: plan.monthlyPrice,
        packageSnapshot: { rateLimit: plan.rateLimit, devicesPerAccount: plan.devicesPerAccount },
        status: 'initiating',
        gatewayProvider: provider,
      }).returning({ id: pppoePayments.id })
      return { accountNumber: account.accountNumber, paymentId: payment.id }
    })

    try {
      if (provider === 'daraja' && darajaConfiguration) {
        const stk = await initiateStkPush({
          phone,
          amount: plan.monthlyPrice,
          accountReference: String(accountNumber.accountNumber),
          productName: plan.name,
          configuration: darajaConfiguration,
        })
        await db.update(pppoePayments).set({
          status: 'pending',
          merchantRequestId: stk.merchantRequestId,
          checkoutRequestId: stk.checkoutRequestId,
        }).where(and(eq(pppoePayments.id, accountNumber.paymentId), eq(pppoePayments.tenantId, tenantId)))
        return NextResponse.json({
          id: accountNumber.paymentId,
          accountNumber: String(accountNumber.accountNumber),
          status: 'pending',
          message: stk.customerMessage,
        }, { status: 202, headers: { 'cache-control': 'no-store' } })
      }
      if (!gatewayConfiguration) throw new Error('Payment gateway settings are unavailable.')
      const baseUrl = new URL(process.env.APP_URL?.trim() || request.nextUrl.origin)
      if (baseUrl.protocol !== 'https:') throw new Error('Hosted checkout requires APP_URL to use HTTPS.')
      const callbackPath = provider === 'pesapal'
        ? '/api/payment-gateways/pesapal/ipn'
        : '/api/payment-gateways/intasend/webhook'
      const returnUrl = await createReturnUrl(accountNumber.paymentId, tenantId, baseUrl)
      const checkout = await createHostedCheckout({
        credentials: gatewayConfiguration,
        reference: accountNumber.paymentId,
        amount: plan.monthlyPrice,
        description: plan.name,
        callbackUrl: new URL(callbackPath, baseUrl).toString(),
        returnUrl,
        phone,
        email,
        name,
      })
      assertHostedCheckoutUrl(provider, checkout.checkoutUrl)
      await db.update(pppoePayments).set({
        status: 'pending',
        checkoutRequestId: checkout.providerReference,
      }).where(and(eq(pppoePayments.id, accountNumber.paymentId), eq(pppoePayments.tenantId, tenantId)))
      return NextResponse.json({
        id: accountNumber.paymentId,
        accountNumber: String(accountNumber.accountNumber),
        status: 'pending',
        checkoutUrl: checkout.checkoutUrl,
        message: `Continue to ${provider === 'pesapal' ? 'Pesapal' : 'IntaSend'} to complete your payment.`,
      }, { status: 202, headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      await db.update(pppoePayments).set({
        status: 'failed',
        failureReason: error instanceof Error ? error.message.slice(0, 180) : 'Unable to start payment.',
      }).where(and(eq(pppoePayments.id, accountNumber.paymentId), eq(pppoePayments.tenantId, tenantId)))
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start payment.' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('There are already several')) return NextResponse.json({ error: message }, { status: 429 })
    console.error('Failed to create PPPoE payment', error)
    return NextResponse.json({ error: 'PPPoE checkout is unavailable. Please try again later.' }, { status: 503 })
  }
}

function assertHostedCheckoutUrl(provider: PaymentGatewayProvider | 'daraja', value: string) {
  const url = new URL(value)
  const allowedDomain = provider === 'pesapal' ? 'pesapal.com' : 'intasend.com'
  if (url.protocol !== 'https:' || !(url.hostname === allowedDomain || url.hostname.endsWith(`.${allowedDomain}`))) {
    throw new Error('The payment provider returned an invalid checkout URL.')
  }
}

async function createReturnUrl(paymentId: string, tenantId: string, baseUrl: URL) {
  const url = new URL('/pppoe/signup', baseUrl)
  url.searchParams.set('payment', paymentId)
  if (tenantId !== 'default') {
    const [tenant] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    if (!tenant) throw new Error('Workspace could not be resolved for the payment return URL.')
    url.searchParams.set('tenant', tenant.slug)
  }
  return url.toString()
}

export const dynamic = 'force-dynamic'
