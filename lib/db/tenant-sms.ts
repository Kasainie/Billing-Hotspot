import { and, asc, count, desc, eq, lt, lte, or, type SQL } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { customers, smsMessages, tenantSmsSettings } from '@/lib/db/schema'
import { decryptTenantSecret, encryptTenantSecret } from '@/lib/db/tenant-secrets'
import { normalizeKenyanPhone } from '@/lib/daraja'
import { sendAfricaTalkingSms, type AfricaTalkingConfiguration } from '@/lib/sms'

type TenantSmsInput = {
  environment: 'sandbox' | 'production'
  username: string
  apiKey: string
  senderId: string | null
}

export function validateTenantSmsInput(input: Record<string, unknown>): TenantSmsInput | null {
  const environment = input.environment
  const username = typeof input.username === 'string' ? input.username.trim() : ''
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  const senderId = typeof input.senderId === 'string' ? input.senderId.trim() : ''
  if ((environment !== 'sandbox' && environment !== 'production') ||
      username.length < 1 || username.length > 100 ||
      apiKey.length < 8 || apiKey.length > 2048 ||
      senderId.length > 11 || (senderId && !/^[A-Za-z0-9]{1,11}$/.test(senderId))) return null
  return { environment, username, apiKey, senderId: senderId || null }
}

export async function saveTenantSmsSettings(tenantId: string, input: TenantSmsInput) {
  const values = {
    tenantId,
    environment: input.environment,
    username: input.username,
    apiKeyEncrypted: encryptTenantSecret(input.apiKey),
    senderId: input.senderId,
    updatedAt: new Date(),
  }
  await db.insert(tenantSmsSettings).values(values).onConflictDoUpdate({
    target: tenantSmsSettings.tenantId,
    set: {
      environment: values.environment,
      username: values.username,
      apiKeyEncrypted: values.apiKeyEncrypted,
      senderId: values.senderId,
      updatedAt: values.updatedAt,
    },
  })
}

export async function getTenantSmsConfiguration(tenantId: string): Promise<AfricaTalkingConfiguration | null> {
  const [settings] = await db.select().from(tenantSmsSettings)
    .where(eq(tenantSmsSettings.tenantId, tenantId))
    .limit(1)
  if (!settings) return null
  return {
    environment: settings.environment === 'sandbox' ? 'sandbox' : 'production',
    username: settings.username,
    apiKey: decryptTenantSecret(settings.apiKeyEncrypted),
    senderId: settings.senderId,
  }
}

export async function sendTestTenantSms(tenantId: string, phoneInput: string) {
  const phone = normalizeKenyanPhone(phoneInput)
  if (!phone) throw new Error('Enter a valid Kenyan mobile number.')
  const configuration = await getTenantSmsConfiguration(tenantId)
  if (!configuration) throw new Error('Configure Africa’s Talking credentials before sending a test message.')
  await sendAfricaTalkingSms(configuration, phone, 'Your SMS settings are working. This is a test message.')
}

export async function sendSubscriberSms(tenantId: string, customerId: string, message: string) {
  const [customer] = await db.select({
    id: customers.id,
    phone: customers.phone,
  }).from(customers).where(and(
    eq(customers.id, customerId),
    eq(customers.tenantId, tenantId),
  )).limit(1)
  if (!customer) return { error: 'Subscriber not found.', httpStatus: 404 as const }
  if (!customer.phone || !normalizeKenyanPhone(customer.phone)) {
    return { error: 'This subscriber does not have a valid Kenyan mobile number.', httpStatus: 409 as const }
  }
  const configuration = await getTenantSmsConfiguration(tenantId)
  if (!configuration) return { error: 'Configure Africa’s Talking in SMS settings before sending messages.', httpStatus: 409 as const }
  const recipient = normalizeKenyanPhone(customer.phone)
  if (!recipient) return { error: 'This subscriber does not have a valid Kenyan mobile number.', httpStatus: 409 as const }

  const [queued] = await db.insert(smsMessages).values({
    tenantId,
    eventKey: `subscriber-manual:${customer.id}:${randomUUID()}`,
    recipient,
    messageEncrypted: encryptTenantSecret(message),
  }).returning({ id: smsMessages.id })
  await deliverTenantSms(queued.id)
  const [delivery] = await db.select({
    status: smsMessages.status,
  }).from(smsMessages).where(and(
    eq(smsMessages.id, queued.id),
    eq(smsMessages.tenantId, tenantId),
  )).limit(1)
  return { status: delivery?.status === 'sent' ? 'sent' as const : 'queued' as const }
}

export async function enqueueTenantSms(tenantId: string, eventKey: string, recipientInput: string | null, message: string, deliverImmediately = true) {
  const recipient = recipientInput ? normalizeKenyanPhone(recipientInput) : null
  if (!recipient) return
  try {
    const [queued] = await db.insert(smsMessages).values({
      tenantId,
      eventKey,
      recipient,
      messageEncrypted: encryptTenantSecret(message),
    }).onConflictDoNothing({
      target: [smsMessages.tenantId, smsMessages.eventKey],
    }).returning({ id: smsMessages.id })
    if (queued && deliverImmediately) await deliverTenantSms(queued.id)
  } catch (error) {
    console.error('Unable to queue customer SMS notification', { tenantId, eventKey, error })
  }
}

async function deliverTenantSms(id: string) {
  const [claimed] = await db.update(smsMessages).set({ status: 'sending', updatedAt: new Date() }).where(and(
    eq(smsMessages.id, id),
    eq(smsMessages.status, 'queued'),
    lte(smsMessages.nextAttemptAt, new Date()),
  )).returning()
  if (!claimed) return

  try {
    const configuration = await getTenantSmsConfiguration(claimed.tenantId)
    if (!configuration) throw new Error('Workspace SMS credentials are not configured.')
    const providerMessageId = await sendAfricaTalkingSms(
      configuration,
      claimed.recipient,
      decryptTenantSecret(claimed.messageEncrypted),
    )
    await db.update(smsMessages).set({
      status: 'sent',
      providerMessageId,
      deliveryStatus: 'pending',
      lastError: null,
      updatedAt: new Date(),
      sentAt: new Date(),
    }).where(and(eq(smsMessages.id, id), eq(smsMessages.status, 'sending')))
  } catch (error) {
    const attempts = claimed.attempts + 1
    const isConfigured = await db.select({ tenantId: tenantSmsSettings.tenantId }).from(tenantSmsSettings)
      .where(eq(tenantSmsSettings.tenantId, claimed.tenantId)).limit(1)
    const configurationMissing = isConfigured.length === 0
    const permanentlyFailed = !configurationMissing && attempts >= 8
    const retryDelayMinutes = configurationMissing ? 30 : Math.min(60, 5 * 2 ** (attempts - 1))
    await db.update(smsMessages).set({
      status: permanentlyFailed ? 'failed' : 'queued',
      deliveryStatus: permanentlyFailed ? 'failed' : 'queued',
      attempts: configurationMissing ? claimed.attempts : attempts,
      nextAttemptAt: new Date(Date.now() + retryDelayMinutes * 60 * 1000),
      lastError: error instanceof Error ? error.message.slice(0, 500) : 'SMS delivery failed.',
      updatedAt: new Date(),
    }).where(and(eq(smsMessages.id, id), eq(smsMessages.status, 'sending')))
    console.error('Africa’s Talking SMS delivery failed', { tenantId: claimed.tenantId, messageId: id, error })
  }
}

export async function processQueuedTenantSms() {
  await db.update(smsMessages).set({ status: 'queued', nextAttemptAt: new Date() }).where(and(
    eq(smsMessages.status, 'sending'),
    lt(smsMessages.updatedAt, new Date(Date.now() - 15 * 60 * 1000)),
  ))
  const dueMessages = await db.select({ id: smsMessages.id }).from(smsMessages).where(and(
    eq(smsMessages.status, 'queued'),
    lte(smsMessages.nextAttemptAt, new Date()),
  )).orderBy(asc(smsMessages.nextAttemptAt)).limit(25)
  for (const message of dueMessages) await deliverTenantSms(message.id)
}

export async function getTenantSmsOverview(tenantId: string, origin: string) {
  const reportSecret = process.env.SMS_DELIVERY_REPORT_SECRET?.trim() || ''
  const reportUrl = /^[A-Za-z0-9_-]{32,256}$/.test(reportSecret)
    ? new URL(`/api/sms/delivery-report?token=${encodeURIComponent(reportSecret)}`, process.env.APP_URL?.trim() || origin).toString()
    : ''
  const [settings] = await Promise.all([
    db.select({
      environment: tenantSmsSettings.environment,
      username: tenantSmsSettings.username,
      senderId: tenantSmsSettings.senderId,
    }).from(tenantSmsSettings).where(eq(tenantSmsSettings.tenantId, tenantId)).limit(1),
  ])
  return {
    configured: settings.length > 0,
    environment: settings[0]?.environment || 'production',
    username: settings[0]?.username || '',
    senderId: settings[0]?.senderId || '',
    deliveryReportUrl: reportUrl,
  }
}

function messageFilter(tenantId: string, status: string): SQL | undefined {
  const tenantFilter = eq(smsMessages.tenantId, tenantId)
  if (status === 'queued') return and(tenantFilter, or(eq(smsMessages.status, 'queued'), eq(smsMessages.status, 'sending')))
  if (status === 'pending') return and(tenantFilter, eq(smsMessages.deliveryStatus, 'pending'))
  if (status === 'delivered') return and(tenantFilter, eq(smsMessages.deliveryStatus, 'delivered'))
  if (status === 'failed') return and(tenantFilter, or(eq(smsMessages.status, 'failed'), eq(smsMessages.deliveryStatus, 'failed')))
  return tenantFilter
}

export async function getTenantSmsMessages(tenantId: string, status: string, offset: number, limit: number) {
  const where = messageFilter(tenantId, status)
  const [messages, totals, queued, pending, delivered, failed] = await Promise.all([
    db.select({
      id: smsMessages.id,
      recipient: smsMessages.recipient,
      status: smsMessages.status,
      deliveryStatus: smsMessages.deliveryStatus,
      lastError: smsMessages.lastError,
      deliveryReport: smsMessages.deliveryReport,
      deliveryReportedAt: smsMessages.deliveryReportedAt,
      createdAt: smsMessages.createdAt,
      sentAt: smsMessages.sentAt,
      resendOfId: smsMessages.resendOfId,
      messageEncrypted: smsMessages.messageEncrypted,
    }).from(smsMessages).where(where).orderBy(desc(smsMessages.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(smsMessages).where(where),
    db.select({ total: count() }).from(smsMessages).where(and(
      eq(smsMessages.tenantId, tenantId),
      or(eq(smsMessages.status, 'queued'), eq(smsMessages.status, 'sending')),
    )),
    db.select({ total: count() }).from(smsMessages).where(and(
      eq(smsMessages.tenantId, tenantId),
      eq(smsMessages.deliveryStatus, 'pending'),
    )),
    db.select({ total: count() }).from(smsMessages).where(and(
      eq(smsMessages.tenantId, tenantId),
      eq(smsMessages.deliveryStatus, 'delivered'),
    )),
    db.select({ total: count() }).from(smsMessages).where(and(
      eq(smsMessages.tenantId, tenantId),
      or(eq(smsMessages.status, 'failed'), eq(smsMessages.deliveryStatus, 'failed')),
    )),
  ])
  return {
    messages: messages.map(({ messageEncrypted, ...item }) => ({
      ...item,
      message: decryptTenantSecret(messageEncrypted),
      deliveryReport: item.deliveryReport && typeof item.deliveryReport === 'object'
        ? item.deliveryReport as Record<string, string | null>
        : null,
    })),
    total: totals[0]?.total || 0,
    counts: {
      queued: queued[0]?.total || 0,
      pending: pending[0]?.total || 0,
      delivered: delivered[0]?.total || 0,
      failed: failed[0]?.total || 0,
    },
  }
}

export async function resendTenantSms(tenantId: string, messageId: string) {
  const [original] = await db.select().from(smsMessages).where(and(
    eq(smsMessages.id, messageId),
    eq(smsMessages.tenantId, tenantId),
  )).limit(1)
  if (!original) return { error: 'SMS record not found.', httpStatus: 404 as const }
  if (original.status !== 'failed' && original.deliveryStatus !== 'failed') {
    return { error: 'Only failed messages can be resent.', httpStatus: 409 as const }
  }
  const configuration = await getTenantSmsConfiguration(tenantId)
  if (!configuration) return { error: 'Configure Africa’s Talking in SMS settings before resending messages.', httpStatus: 409 as const }
  const [resend] = await db.insert(smsMessages).values({
    tenantId,
    eventKey: `resend:${original.id}:${randomUUID()}`,
    recipient: original.recipient,
    messageEncrypted: original.messageEncrypted,
    resendOfId: original.id,
  }).returning({ id: smsMessages.id })
  await deliverTenantSms(resend.id)
  const [delivery] = await db.select({
    status: smsMessages.status,
    deliveryStatus: smsMessages.deliveryStatus,
  }).from(smsMessages).where(and(
    eq(smsMessages.id, resend.id),
    eq(smsMessages.tenantId, tenantId),
  )).limit(1)
  return {
    id: resend.id,
    status: delivery?.status === 'sent' ? delivery.deliveryStatus : delivery?.status || 'queued',
  }
}

export async function recordSmsDeliveryReport(input: {
  providerMessageId: string
  status: string
  networkCode: string | null
  failureReason: string | null
  retryCount: string | null
  cost: string | null
  requestId: string | null
  bulkId: string | null
  linkId: string | null
}) {
  const [message] = await db.select({ id: smsMessages.id }).from(smsMessages)
    .where(eq(smsMessages.providerMessageId, input.providerMessageId)).limit(1)
  if (!message) return false
  const normalizedStatus = input.status.toLowerCase()
  const deliveryStatus = normalizedStatus === 'success' || normalizedStatus === 'delivered'
    ? 'delivered'
    : normalizedStatus === 'failed' ? 'failed' : 'pending'
  const report = {
    status: input.status.slice(0, 120),
    networkCode: input.networkCode?.slice(0, 100) || null,
    failureReason: input.failureReason?.slice(0, 500) || null,
    retryCount: input.retryCount?.slice(0, 40) || null,
    cost: input.cost?.slice(0, 100) || null,
    requestId: input.requestId?.slice(0, 200) || null,
    bulkId: input.bulkId?.slice(0, 200) || null,
    linkId: input.linkId?.slice(0, 200) || null,
  }
  await db.update(smsMessages).set({
    deliveryStatus,
    deliveryReport: report,
    deliveryReportedAt: new Date(),
    lastError: deliveryStatus === 'failed' ? report.failureReason || 'The provider reported that delivery failed.' : null,
    updatedAt: new Date(),
  }).where(eq(smsMessages.id, message.id))
  return true
}
