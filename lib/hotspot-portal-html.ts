export function prepareHotspotPortalHtml(template: string, tenantSlug: string, assetBaseUrl: string) {
  const tenantMarker = "var portalTenantSlug = '';"
  const stylesheetMarker = 'href="style.css"'
  const chapScriptMarker = '<script src="md5.js"></script>'
  if (!template.includes(tenantMarker) || !template.includes(stylesheetMarker) || !template.includes(chapScriptMarker)) {
    throw new Error('Captive portal template is missing a required marker.')
  }

  const stylesheetUrl = new URL('/hotspot-assets/style.css', assetBaseUrl).toString()
  const chapScriptUrl = new URL('/hotspot-assets/md5.js', assetBaseUrl).toString()
  return template
    .replace(stylesheetMarker, `href="${stylesheetUrl}"`)
    .replace(chapScriptMarker, `<script src="${chapScriptUrl}"></script>`)
    .replace(tenantMarker, `var portalTenantSlug = ${JSON.stringify(tenantSlug)};`)
}
