export type EmailConfiguration = {
  apiKey: string
  from: string
}

type OutgoingEmail = {
  to: string[]
  subject: string
  html: string
  text: string
}

export function getEmailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.PASSWORD_RESET_FROM?.trim()
  if (!apiKey || !from) return null
  return { apiKey, from } satisfies EmailConfiguration
}

export async function sendEmail(mail: EmailConfiguration, email: OutgoingEmail) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${mail.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: mail.from, ...email }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) console.error('Resend rejected email', { status: response.status })
  return response.ok
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}
