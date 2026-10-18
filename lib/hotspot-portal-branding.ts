import { defaultHotspotPortalBranding } from './hotspot-templates.ts'

const companyNameMarker = '{{PORTAL_COMPANY_NAME}}'
const companyNameMarkupMarker = '{{PORTAL_COMPANY_NAME_MARKUP}}'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCompanyNameMarkup(companyName: string) {
  const [primary = '', ...remaining] = companyName.trim().split(/\s+/).filter(Boolean)
  const accent = remaining.join(' ') || '.'
  return `<span class="portal-brand-primary">${escapeHtml(primary)}</span> <span class="portal-brand-accent">${escapeHtml(accent)}</span>`
}

export function resolveHotspotCompanyName(companyName: string | null | undefined) {
  const cleaned = companyName?.trim()
  return !cleaned || cleaned.toUpperCase() === 'LKTECH'
    ? defaultHotspotPortalBranding.companyName
    : cleaned
}

export function prepareHotspotPortalBranding(template: string, companyName: string) {
  const escapedCompanyName = escapeHtml(companyName)
  return template
    .replaceAll(companyNameMarkupMarker, formatCompanyNameMarkup(companyName))
    .replaceAll(companyNameMarker, escapedCompanyName)
}
