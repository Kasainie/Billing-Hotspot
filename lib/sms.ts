export type InfobipConfiguration = {
  baseUrl: string
  apiKey: string
  smsSender: string
  whatsappSender: string | null
}

export type MessageChannel = 'sms' | 'whatsapp'

export class InfobipApiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'InfobipApiError'
  }
}

export async function sendInfobipMessage(
  configuration: InfobipConfiguration,
  recipient: string,
  message: string,
  channel: MessageChannel,
  statusCallbackUrl: string | null,
) {
  const formattedRecipient = recipient.replace(/^\+/, '')
  const endpoint = channel === 'whatsapp' ? '/whatsapp/1/message/text' : '/sms/3/messages'
  const payload = channel === 'whatsapp'
    ? {
        from: configuration.whatsappSender?.replace(/^\+/, ''),
        to: formattedRecipient,
        content: { text: message },
        ...(statusCallbackUrl ? { notifyUrl: statusCallbackUrl } : {}),
      }
    : {
        messages: [{
          sender: configuration.smsSender.replace(/^\+/, ''),
          destinations: [{ to: formattedRecipient }],
          content: { text: message },
          ...(statusCallbackUrl ? { webhooks: { delivery: { url: statusCallbackUrl } } } : {}),
        }],
      }
  if (channel === 'whatsapp' && !configuration.whatsappSender) {
    throw new Error('Configure an Infobip WhatsApp sender before sending WhatsApp messages.')
  }

  const response = await fetch(`${configuration.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `App ${configuration.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })
  const responseText = await response.text()
  let result: {
    messageId?: unknown
    messages?: Array<{ messageId?: unknown; status?: { description?: unknown } }>
    requestError?: { serviceException?: { text?: unknown; messageId?: unknown } }
  }
  try {
    result = JSON.parse(responseText) as typeof result
  } catch {
    throw new InfobipApiError(`Infobip returned an invalid response (HTTP ${response.status}).`, response.status === 429 || response.status >= 500)
  }
  if (!response.ok) {
    const serviceException = result.requestError?.serviceException
    const detail = typeof serviceException?.text === 'string'
      ? serviceException.text
      : typeof serviceException?.messageId === 'string' ? serviceException.messageId : `HTTP ${response.status}`
    throw new InfobipApiError(`Infobip rejected the message: ${detail}`, response.status === 429 || response.status >= 500)
  }
  const messageId = result.messageId ?? result.messages?.[0]?.messageId
  if (typeof messageId !== 'string' || !messageId) {
    const status = result.messages?.[0]?.status?.description
    throw new Error(typeof status === 'string'
      ? `Infobip accepted the request without returning a message ID: ${status}`
      : 'Infobip accepted the request without returning a message ID.')
  }
  return messageId
}
