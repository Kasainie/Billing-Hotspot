export type AfricaTalkingConfiguration = {
  environment: 'sandbox' | 'production'
  username: string
  apiKey: string
  senderId: string | null
}

export async function sendAfricaTalkingSms(configuration: AfricaTalkingConfiguration, recipient: string, message: string) {
  const endpoint = configuration.environment === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      apiKey: configuration.apiKey,
    },
    body: new URLSearchParams({
      username: configuration.username,
      to: recipient.startsWith('+') ? recipient : `+${recipient}`,
      message,
      ...(configuration.senderId ? { from: configuration.senderId } : {}),
    }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  const result = await response.json() as {
    SMSMessageData?: {
      Message?: string
      Recipients?: Array<{ status?: string; statusCode?: number; messageId?: string }>
    }
  }
  const recipientResult = result.SMSMessageData?.Recipients?.[0]
  if (!response.ok || (recipientResult?.statusCode !== 101 && recipientResult?.status !== 'Success')) {
    throw new Error(result.SMSMessageData?.Message || `Africa's Talking rejected the SMS (HTTP ${response.status}).`)
  }
  return recipientResult.messageId || null
}
