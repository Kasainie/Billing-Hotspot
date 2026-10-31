export function getPlatformAdminEmails(_configuredValue?: string) {
  return new Set(['info@lktech.life'])
}

export function isPlatformAdminEmail(email: string, configuredEmails = getPlatformAdminEmails()) {
  return configuredEmails.has(email.trim().toLowerCase())
}
