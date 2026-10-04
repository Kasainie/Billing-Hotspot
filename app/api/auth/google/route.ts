import { randomBytes } from 'node:crypto'
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'
import { NextRequest, NextResponse } from 'next/server'
import { getGoogleOAuthConfiguration } from '@/lib/google-oauth'

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 600,
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  const configured = getGoogleOAuthConfiguration(request.url)
  if (!configured) {
    return NextResponse.redirect(new URL(`/${mode}?error=google_unavailable`, request.url))
  }

  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const { codeVerifier, codeChallenge } = await configured.client.generateCodeVerifierAsync()
  const authorizationUrl = configured.client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    response_type: 'code',
    scope: ['openid', 'email', 'profile'],
    redirect_uri: configured.redirectUri,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  })
  const response = NextResponse.redirect(authorizationUrl)
  response.cookies.set('google_oauth_state', state, cookieOptions)
  response.cookies.set('google_oauth_nonce', nonce, cookieOptions)
  response.cookies.set('google_oauth_verifier', codeVerifier, cookieOptions)
  response.cookies.set('google_oauth_mode', mode, cookieOptions)
  return response
}
