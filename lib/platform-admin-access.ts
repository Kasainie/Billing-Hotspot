export function getPlatformAdminEmails(value = process.env.PLATFORM_ADMIN_EMAILS || '') {
  return new Set(value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
}

export function isPlatformAdminEmail(email: string, configuredEmails = getPlatformAdminEmails()) {
  return configuredEmails.has(email.trim().toLowerCase())
}
