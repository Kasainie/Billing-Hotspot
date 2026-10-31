const protectedApiPath = /^\/api\/(?:sites|customers|packages|payments|operations\/|tenant\/|tenants(?:\/|$)|platform-admin(?:\/|$)|hotspot\/sessions\/actions(?:\/|$)|hotspot\/portal-template(?:\/|$)|routers\/(?:monitoring|provisioning)(?:\/|$)|routers\/[^/]+\/(?:connector|monitoring|resources|sessions)(?:\/|$)|customers\/[^/]+\/(?:status|actions|sms)(?:\/|$))/

export function requiresAdminPasswordConfirmation(pathname: string, method: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return false
  if (pathname === '/api/sites' && ['PATCH', 'DELETE'].includes(method.toUpperCase())) return false
  if (/^\/api\/routers\/[^/]+\/monitoring$/.test(pathname) && ['PATCH', 'DELETE'].includes(method.toUpperCase())) return false
  return protectedApiPath.test(pathname)
}
