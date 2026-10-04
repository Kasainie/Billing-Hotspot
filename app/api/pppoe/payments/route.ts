import { and, count, eq, gt, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { initiateStkPush, normalizeKenyanPhone } from '@/lib/daraja'
import { db } from '@/lib/db'
import { packages, pppoeAccounts, pppoePayments } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { getTenantDarajaConfiguration } from '@/lib/db/tenant-payments'

export async function POST(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  let darajaConfiguration
  try {
    darajaConfiguration = await getTenantDarajaConfiguration(tenantId)
  } catch (error) {
    console.error('Failed to load tenant Daraja configuration', error)
    return NextResponse.json({ error: 'Workspace payment credentials could not be loaded.' }, { status: 503 })
  }
  if (!darajaConfiguration) {
    return NextResponse.json({ error: 'M-Pesa payments are not available yet. Please contact customer care.' }, { status: 503 })
  }

  let input: { name?: unknown; email?: unknown; phone?: unknown; packageId?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter your details and choose a PPPoE package.' }, { status: 400 })
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const phone = typeof input.phone === 'string' ? normalizeKenyanPhone(input.phone) : null
  const packageId = typeof input.packageId === 'string' ? input.packageId : ''
  if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !phone ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packageId)) {
    return NextResponse.json({ error: 'Enter a valid name, email, Kenyan phone number, and PPPoE package.' }, { status: 400 })
  }

  try {
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
    if (plan.monthlyPrice <= 0) return NextResponse.json({ error: 'Free PPPoE packages cannot be purchased through M-Pesa.' }, { status: 400 })

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
      if ((recent?.total || 0) >= 3) throw new Error('There are already several M-Pesa prompts for this account. Wait a few minutes and try again.')

      const [payment] = await tx.insert(pppoePayments).values({
        tenantId,
        accountNumber: account.accountNumber,
        productId: plan.id,
        productName: plan.name,
        durationSeconds: plan.durationSeconds,
        amount: plan.monthlyPrice,
        packageSnapshot: { rateLimit: plan.rateLimit, devicesPerAccount: plan.devicesPerAccount },
        status: 'initiating',
      }).returning({ id: pppoePayments.id })
      return { accountNumber: account.accountNumber, paymentId: payment.id }
    })

    try {
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
    } catch (error) {
      await db.update(pppoePayments).set({
        status: 'failed',
        failureReason: error instanceof Error ? error.message.slice(0, 180) : 'Unable to start payment.',
      }).where(and(eq(pppoePayments.id, accountNumber.paymentId), eq(pppoePayments.tenantId, tenantId)))
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start M-Pesa payment.' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('There are already several')) return NextResponse.json({ error: message }, { status: 429 })
    return NextResponse.json({ error: 'PPPoE checkout is unavailable. Please try again later.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
