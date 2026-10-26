export const KENYAN_MOBILE_PHONE_PATTERN = '(?:07[0-9]{8}|\\+254[17][0-9]{8})'

export function normalizeKenyanPhoneInput(value: string) {
  const phone = value.trim()
  if (/^07[0-9]{8}$/.test(phone)) return `254${phone.slice(1)}`
  if (/^\+254[17][0-9]{8}$/.test(phone)) return phone.slice(1)
  return null
}

export function formatKenyanPhoneInput(value: string | null | undefined) {
  if (value?.startsWith('254') && /^254[17][0-9]{8}$/.test(value)) return `+${value}`
  return value || ''
}
