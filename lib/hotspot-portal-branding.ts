import { defaultHotspotPortalBranding } from './hotspot-templates.ts'

const companyNameMarker = '{{PORTAL_COMPANY_NAME}}'

export function resolveHotspotCompanyName(companyName: string | null | undefined) {
  const cleaned = companyName?.trim()
  return !cleaned || cleaned.toUpperCase() === 'LKTECH'
    ? defaultHotspotPortalBranding.companyName
    : cleaned
}

export function prepareHotspotPortalBranding(template: string, companyName: string) {
  const escapedCompanyName = companyName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return template.replaceAll(companyNameMarker, escapedCompanyName)
}
