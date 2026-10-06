export function getHotspotReturnUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.username || url.password) return null

  if (url.protocol === 'https:' && url.hostname === 'login.lktech.life' && !url.port &&
      (url.pathname === '/' || url.pathname === '/login')) {
    return url.toString()
  }

  if (url.protocol !== 'http:') return null
  const hostname = url.hostname
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!ipv4) return hostname === 'localhost' || hostname.endsWith('.lan') ? url.toString() : null

  const octets = ipv4.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return null
  const isPrivateAddress = octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254)
  return isPrivateAddress ? url.toString() : null
}
