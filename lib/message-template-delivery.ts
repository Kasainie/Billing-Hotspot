import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenantWorkspaceSettings } from '@/lib/db/schema'
import { enqueueTenantSms } from '@/lib/db/tenant-sms'
import { messageTemplateDefaults, messageTemplateDefinitions, type MessageTemplateId } from '@/lib/message-templates'
import { renderMessageTemplate, type MessageVariables } from '@/lib/message-template-renderer'

type TemplateOptions = {
  customerId?: string | null
  deliverImmediately?: boolean
  firstPurchase?: boolean
  templateSettings?: Record<string, string | number | boolean>
}

export async function getTenantTemplateSettings(tenantId: string): Promise<Record<string, string | number | boolean>> {
  const [record] = await db.select({ settings: tenantWorkspaceSettings.settings })
    .from(tenantWorkspaceSettings)
    .where(eq(tenantWorkspaceSettings.tenantId, tenantId))
    .limit(1)
  const supportContact = typeof record?.settings.templates?.supportContact === 'string' &&
      record.settings.templates.supportContact.trim()
    ? record.settings.templates.supportContact.trim()
    : typeof record?.settings.branding?.supportPhone === 'string'
      ? record.settings.branding.supportPhone
      : ''
  return {
    ...messageTemplateDefaults,
    ...(record?.settings.templates || {}),
    supportContact,
    supportPhone: supportContact,
  }
}

export async function enqueueTenantTemplateSms(
  tenantId: string,
  eventKey: string,
  recipient: string | null,
  templateId: MessageTemplateId,
  variables: MessageVariables,
  options: TemplateOptions = {},
): Promise<boolean> {
  const definition = messageTemplateDefinitions.find((template) => template.id === templateId)
  if (!definition) throw new Error(`Unknown SMS template: ${templateId}`)

  let settings = options.templateSettings
  if (!settings) {
    try {
      settings = await getTenantTemplateSettings(tenantId)
    } catch (error) {
      console.error('Unable to load workspace SMS templates; using the built-in default', { tenantId, templateId, error })
      settings = messageTemplateDefaults
    }
  }
  if (settings[definition.enabledKey] === false) return false
  if (templateId === 'hotspotPaymentReceipt' &&
      settings.hotspotFirstPurchaseOnly === true &&
      options.firstPurchase === false) return false

  const configured = settings[templateId]
  const template = typeof configured === 'string' && configured.trim()
    ? configured
    : definition.defaultMessage
  const message = renderMessageTemplate(template, {
    ...variables,
    supportContact: variables.supportContact ?? settings.supportContact ?? settings.supportPhone,
    supportPhone: variables.supportPhone ?? settings.supportContact ?? settings.supportPhone,
  })
  return enqueueTenantSms(
    tenantId,
    eventKey,
    recipient,
    message,
    options.deliverImmediately ?? true,
    options.customerId ?? null,
  )
}
