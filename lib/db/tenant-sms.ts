import { and, asc, count, desc, eq, lt, lte, or, type SQL } from 'drizzle-orm'
import { createHmac, randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { customers, smsMessages, tenantSmsSettings } from '@/lib/db/schema'
import { decryptTenantSecret, encryptTenantSecret, tryDecryptTenantSecret } from '@/lib/db/tenant-secrets'
import { normalizeKenyanPhone } from '@/lib/daraja'
import { normalizeKenyanPhoneInput } from '@/lib/kenyan-phone'
import { sendInfobipMessage, InfobipApiError, type InfobipConfiguration, type MessageChannel } from '@/lib/sms'

type TenantInfobipInput = {
  baseUrl: string
  apiKey: string | null
  smsSender: string
  whatsappSender: string | null
}

export function validateTenantInfobipInput(input: Record<string, unknown>): TenantInfobipInput | null {
  const baseUrlInput = typeof input.baseUrl === 'string' ? input.baseUrl.trim().replace(/\/+$/, '') : ''
  const baseUrl = /^https:\/\//i.test(baseUrlInput) ? baseUrlInput : `https://${baseUrlInput}`
  const apiKeyInput = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  const apiKey = apiKeyInput || null
  const smsSender = typeof input.smsSender === 'string' ? input.smsSender.trim() : ''
  const whatsappSender = typeof input.whatsappSender === 'string' ? input.whatsappSender.trim() : ''
  const validPhone = (value: string) => /^\+[1-9]\d{7,14}$/.test(value)
  let parsedBaseUrl: URL
  try {
    parsedBaseUrl = new URL(baseUrl)
  } catch {
    return null
  }
  if (parsedBaseUrl.protocol !== 'https:' ||
      !parsedBaseUrl.hostname.toLowerCase().endsWith('.infobip.com') ||
      parsedBaseUrl.port ||
      parsedBaseUrl.username ||
      parsedBaseUrl.password ||
      parsedBaseUrl.pathname !== '/' ||
      parsedBaseUrl.search ||
      parsedBaseUrl.hash ||
      (apiKey && (apiKey.length < 8 || apiKey.length > 512)) ||
      !smsSender ||
      smsSender.length > 30 ||
      (whatsappSender && !validPhone(whatsappSender))) return null
  return {
    baseUrl: parsedBaseUrl.origin,
    apiKey,
    smsSender,
    whatsappSender: whatsappSender || null,
  }
}

export async function saveTenantInfobipSettings(tenantId: string, input: TenantInfobipInput) {
  const [existing] = await db.select({
    apiKeyEncrypted: tenantSmsSettings.infobipApiKeyEncrypted,
  }).from(tenantSmsSettings).where(eq(tenantSmsSettings.tenantId, tenantId)).limit(1)
  const apiKeyEncrypted = input.apiKey
    ? encryptTenantSecret(input.apiKey)
    : existing?.apiKeyEncrypted
  if (!apiKeyEncrypted) throw new Error('INFOBIP_API_KEY_REQUIRED')

  const values = {
    tenantId,
    infobipBaseUrl: input.baseUrl,
    infobipApiKeyEncrypted: apiKeyEncrypted,
    infobipSmsSender: input.smsSender,
    infobipWhatsappSender: input.whatsappSender,
    updatedAt: new Date(),
  }
  await db.insert(tenantSmsSettings).values(values).onConflictDoUpdate({
    target: tenantSmsSettings.tenantId,
    set: {
      infobipBaseUrl: values.infobipBaseUrl,
      infobipSmsSender: values.infobipSmsSender,
      infobipWhatsappSender: values.infobipWhatsappSender,
      updatedAt: values.updatedAt,
      ...(input.apiKey ? { infobipApiKeyEncrypted: values.infobipApiKeyEncrypted } : {}),
    },
  })
}

export async function getTenantInfobipConfiguration(tenantId: string): Promise<InfobipConfiguration | null> {
  const [settings] = await db.select({
    baseUrl: tenantSmsSettings.infobipBaseUrl,
    apiKeyEncrypted: tenantSmsSettings.infobipApiKeyEncrypted,
    smsSender: tenantSmsSettings.infobipSmsSender,
    whatsappSender: tenantSmsSettings.infobipWhatsappSender,
  }).from(tenantSmsSettings)
    .where(eq(tenantSmsSettings.tenantId, tenantId))
    .limit(1)
  if (!settings?.baseUrl || !settings.apiKeyEncrypted || !settings.smsSender) return null
  return {
    baseUrl: settings.baseUrl,
    apiKey: decryptTenantSecret(settings.apiKeyEncrypted),
    smsSender: settings.smsSender,
    whatsappSender: settings.whatsappSender,
  }
}

export function getInfobipStatusCallbackToken(tenantId: string) {
  const configuredKey = process.env.TENANT_SECRETS_ENCRYPTION_KEY?.trim()
  if (!configuredKey) throw new Error('TENANT_SECRETS_ENCRYPTION_KEY is required for Infobip callbacks.')
  return createHmac('sha256', configuredKey).update(`infobip-status:${tenantId}`).digest('hex')
}

function getInfobipStatusCallbackUrl(tenantId: string) {
  const configuredOrigin = process.env.APP_URL?.trim()
  if (!configuredOrigin) return null
  const origin = new URL(configuredOrigin)
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') {
    throw new Error('APP_URL must use HTTPS for Infobip delivery callbacks.')
  }
  const callback = new URL('/api/infobip/status', origin)
  callback.searchParams.set('tenantId', tenantId)
  callback.searchParams.set('token', getInfobipStatusCallbackToken(tenantId))
  return callback.toString()
}

export async function sendTestTenantSms(tenantId: string, phoneInput: string) {
  const phone = normalizeKenyanPhoneInput(phoneInput)
  if (!phone) throw new Error('Enter a valid Kenyan number: use 07 followed by 8 digits or +254 followed by 9 digits.')
  const configuration = await getTenantInfobipConfiguration(tenantId)
  if (!configuration) throw new Error('Configure Infobip SMS credentials before sending a test message.')
  await sendInfobipMessage(configuration, `+${phone}`, 'Your Infobip SMS settings are working. This is a test message.', 'sms', null)
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
  const configuration = await getTenantInfobipConfiguration(tenantId)
  if (!configuration) return { error: 'Configure Infobip in Communications before sending messages.', httpStatus: 409 as const }
  const recipient = normalizeKenyanPhone(customer.phone)
  if (!recipient) return { error: 'This subscriber does not have a valid Kenyan mobile number.', httpStatus: 409 as const }

  const [queued] = await db.insert(smsMessages).values({
    tenantId,
    customerId,
    eventKey: `subscriber-manual:${customer.id}:${randomUUID()}`,
    recipient,
    messageEncrypted: encryptTenantSecret(message),
  }).returning({ id: smsMessages.id })
  await deliverTenantSms(queued.id)
  const [delivery] = await db.select({
    status: smsMessages.status,
    lastError: smsMessages.lastError,
  }).from(smsMessages).where(and(
    eq(smsMessages.id, queued.id),
    eq(smsMessages.tenantId, tenantId),
  )).limit(1)
  if (delivery?.status === 'failed') {
    return { error: delivery.lastError || 'Infobip rejected the SMS.', httpStatus: 502 as const }
  }
  return { status: delivery?.status === 'sent' ? 'sent' as const : 'queued' as const }
}

export async function sendManualTenantSms(tenantId: string, phoneInput: string, message: string, channel: MessageChannel = 'sms') {
  const recipient = normalizeKenyanPhoneInput(phoneInput)
  if (!recipient) return { error: 'Enter a valid Kenyan number: use 07 followed by 8 digits or +254 followed by 9 digits.', httpStatus: 400 as const }
  const normalizedMessage = message.trim()
  if (!normalizedMessage || normalizedMessage.length > 1000) {
    return { error: 'Enter a message between 1 and 1000 characters.', httpStatus: 400 as const }
  }
  const configuration = await getTenantInfobipConfiguration(tenantId)
  if (!configuration) return { error: 'Configure Infobip credentials before sending messages.', httpStatus: 409 as const }
  if (channel === 'whatsapp' && !configuration.whatsappSender) {
    return { error: 'Configure an Infobip WhatsApp sender before sending WhatsApp messages.', httpStatus: 409 as const }
  }
  const [queued] = await db.insert(smsMessages).values({
    tenantId,
    eventKey: `manual:${randomUUID()}`,
    channel,
    recipient,
    messageEncrypted: encryptTenantSecret(normalizedMessage),
  }).returning({ id: smsMessages.id })
  await deliverTenantSms(queued.id)
  const [delivery] = await db.select({
    status: smsMessages.status,
    lastError: smsMessages.lastError,
  }).from(smsMessages).where(and(
    eq(smsMessages.id, queued.id),
    eq(smsMessages.tenantId, tenantId),
  )).limit(1)
  if (delivery?.status === 'failed') {
    return { error: delivery.lastError || 'Infobip rejected the message.', httpStatus: 502 as const }
  }
  return { status: delivery?.status === 'sent' ? 'sent' as const : 'queued' as const }
}

export async function enqueueTenantSms(
  tenantId: string,
  eventKey: string,
  recipientInput: string | null,
  message: string,
  deliverImmediately = true,
  customerId: string | null = null,
): Promise<boolean> {
  const recipient = recipientInput ? normalizeKenyanPhone(recipientInput) : null
  if (!recipient) return false
  try {
    const [queued] = await db.insert(smsMessages).values({
      tenantId,
      customerId,
      eventKey,
      recipient,
      messageEncrypted: encryptTenantSecret(message),
    }).onConflictDoNothing({
      target: [smsMessages.tenantId, smsMessages.eventKey],
    }).returning({ id: smsMessages.id })
    if (!queued) return false
    if (deliverImmediately) await deliverTenantSms(queued.id)
    return true
  } catch (error) {
    console.error('Unable to queue customer SMS notification', { tenantId, eventKey, error })
    return false
  }
}

async function deliverTenantSms(id: string) {
  const [claimed] = await db.update(smsMessages).set({ status: 'sending', updatedAt: new Date() }).where(and(
    eq(smsMessages.id, id),
    eq(smsMessages.status, 'queued'),
    lte(smsMessages.nextAttemptAt, new Date()),
  )).returning()
  if (!claimed) return

  let configurationMissing = false
  try {
    const configuration = await getTenantInfobipConfiguration(claimed.tenantId)
    if (!configuration) {
      configurationMissing = true
      throw new Error('Workspace Infobip credentials are not configured.')
    }
    if (claimed.channel !== 'sms' && claimed.channel !== 'whatsapp') {
      throw new Error('The queued message has an unsupported delivery channel.')
    }
    if (claimed.channel === 'whatsapp' && !configuration.whatsappSender) {
      configurationMissing = true
      throw new Error('Workspace Infobip WhatsApp sender is not configured.')
    }
    const providerMessageId = await sendInfobipMessage(
      configuration,
      `+${claimed.recipient.replace(/^\+/, '')}`,
      decryptTenantSecret(claimed.messageEncrypted),
      claimed.channel,
      getInfobipStatusCallbackUrl(claimed.tenantId),
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
    const permanentlyFailed = (error instanceof InfobipApiError && !error.retryable) ||
      (!configurationMissing && attempts >= 8)
    const retryDelayMinutes = configurationMissing ? 30 : Math.min(60, 5 * 2 ** (attempts - 1))
    await db.update(smsMessages).set({
      status: permanentlyFailed ? 'failed' : 'queued',
      deliveryStatus: permanentlyFailed ? 'failed' : 'queued',
      attempts: configurationMissing ? claimed.attempts : attempts,
      nextAttemptAt: new Date(Date.now() + retryDelayMinutes * 60 * 1000),
      lastError: error instanceof Error ? error.message.slice(0, 500) : 'SMS delivery failed.',
      updatedAt: new Date(),
    }).where(and(eq(smsMessages.id, id), eq(smsMessages.status, 'sending')))
    console.error('Infobip message delivery failed', { tenantId: claimed.tenantId, messageId: id, error })
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

export async function getTenantSmsOverview(tenantId: string) {
  const [settings] = await Promise.all([
    db.select({
      baseUrl: tenantSmsSettings.infobipBaseUrl,
      smsSender: tenantSmsSettings.infobipSmsSender,
      whatsappSender: tenantSmsSettings.infobipWhatsappSender,
      hasApiKey: tenantSmsSettings.infobipApiKeyEncrypted,
    }).from(tenantSmsSettings).where(eq(tenantSmsSettings.tenantId, tenantId)).limit(1),
  ])
  const callbackOrigin = process.env.APP_URL?.trim()
  const callback = callbackOrigin ? new URL('/api/infobip/status', callbackOrigin) : null
  callback?.searchParams.set('tenantId', tenantId)
  if (callback) callback.searchParams.set('token', getInfobipStatusCallbackToken(tenantId))
  return {
    configured: Boolean(settings[0]?.baseUrl && settings[0]?.hasApiKey && settings[0]?.smsSender),
    baseUrl: settings[0]?.baseUrl || '',
    smsSender: settings[0]?.smsSender || '',
    whatsappSender: settings[0]?.whatsappSender || '',
    whatsappConfigured: Boolean(settings[0]?.whatsappSender),
    statusCallbackUrl: callback?.toString() || '',
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
      channel: smsMessages.channel,
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
    messages: messages.map(({ messageEncrypted, ...item }) => {
      const decrypted = tryDecryptTenantSecret(messageEncrypted)
      return {
        ...item,
        message: decrypted.value,
        messageError: decrypted.error,
        deliveryReport: item.deliveryReport && typeof item.deliveryReport === 'object'
          ? item.deliveryReport as Record<string, string | null>
          : null,
      }
    }),
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
  const configuration = await getTenantInfobipConfiguration(tenantId)
  if (!configuration) return { error: 'Configure Infobip in Communications before resending messages.', httpStatus: 409 as const }
  if (original.channel === 'whatsapp' && !configuration.whatsappSender) {
    return { error: 'Configure an Infobip WhatsApp sender before resending this message.', httpStatus: 409 as const }
  }
  const [resend] = await db.insert(smsMessages).values({
    tenantId,
    eventKey: `resend:${original.id}:${randomUUID()}`,
    channel: original.channel,
    recipient: original.recipient,
    messageEncrypted: original.messageEncrypted,
    resendOfId: original.id,
  }).returning({ id: smsMessages.id })
  await deliverTenantSms(resend.id)
  const [delivery] = await db.select({
    status: smsMessages.status,
    deliveryStatus: smsMessages.deliveryStatus,
    lastError: smsMessages.lastError,
  }).from(smsMessages).where(and(
    eq(smsMessages.id, resend.id),
    eq(smsMessages.tenantId, tenantId),
  )).limit(1)
  if (delivery?.status === 'failed') {
    return { error: delivery.lastError || 'Infobip rejected the message.', httpStatus: 502 as const }
  }
  return {
    id: resend.id,
    status: delivery?.status === 'sent' ? delivery.deliveryStatus : delivery?.status || 'queued',
  }
}

export async function recordInfobipDeliveryReport(input: {
  tenantId: string
  providerMessageId: string
  status: string
  errorCode: string | null
  errorMessage: string | null
}) {
  const [message] = await db.select({ id: smsMessages.id }).from(smsMessages).where(and(
    eq(smsMessages.providerMessageId, input.providerMessageId),
    eq(smsMessages.tenantId, input.tenantId),
  )).limit(1)
  if (!message) return false
  const normalizedStatus = input.status.toLowerCase()
  const failed = normalizedStatus.includes('fail') || normalizedStatus.includes('undeliver') ||
    normalizedStatus.includes('reject') || normalizedStatus.includes('expired') ||
    Boolean(input.errorCode || input.errorMessage)
  const deliveryStatus = failed
    ? 'failed'
    : normalizedStatus.includes('deliver') || normalizedStatus.includes('read') || normalizedStatus.includes('seen')
      ? 'delivered'
      : 'pending'
  const report = {
    status: input.status.slice(0, 120),
    errorCode: input.errorCode?.slice(0, 100) || null,
    errorMessage: input.errorMessage?.slice(0, 500) || null,
  }
  await db.update(smsMessages).set({
    deliveryStatus,
    deliveryReport: report,
    deliveryReportedAt: new Date(),
    lastError: deliveryStatus === 'failed' ? report.errorMessage || 'Infobip reported that delivery failed.' : null,
    status: deliveryStatus === 'failed' ? 'failed' : undefined,
    updatedAt: new Date(),
  }).where(eq(smsMessages.id, message.id))
  return true
}
