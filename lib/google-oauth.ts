import { OAuth2Client } from 'google-auth-library'

export function getGoogleOAuthConfiguration(requestUrl: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || ''
  if (!clientId || !clientSecret) return null

  let redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || ''
  if (!redirectUri && process.env.NODE_ENV === 'development') {
    const requestOrigin = new URL(requestUrl)
    if (['localhost', '127.0.0.1', '[::1]'].includes(requestOrigin.hostname)) {
      redirectUri = new URL('/api/auth/google/callback', requestOrigin).toString()
    }
  }
  if (!redirectUri) return null

  let parsedRedirectUri: URL
  try {
    parsedRedirectUri = new URL(redirectUri)
  } catch {
    return null
  }
  const isLocalDevelopment = process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsedRedirectUri.hostname)
  if ((parsedRedirectUri.protocol !== 'https:' && !(isLocalDevelopment && parsedRedirectUri.protocol === 'http:')) ||
      parsedRedirectUri.pathname !== '/api/auth/google/callback' ||
      parsedRedirectUri.search || parsedRedirectUri.hash) return null

  return {
    clientId,
    redirectUri: parsedRedirectUri.toString(),
    client: new OAuth2Client(clientId, clientSecret, parsedRedirectUri.toString()),
  }
}
