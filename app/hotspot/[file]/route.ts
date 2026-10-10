import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getHotspotBundleScript } from '@/lib/router-provisioning'

const hotspotAssetContentTypes: Record<string, string> = {
  'login.html': 'text/html; charset=utf-8',
  'status.html': 'text/html; charset=utf-8',
  'logout.html': 'text/html; charset=utf-8',
  'error.html': 'text/html; charset=utf-8',
  'alogin.html': 'text/html; charset=utf-8',
  'api.json': 'application/json; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'md5.js': 'application/javascript; charset=utf-8',
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params
  const assetBaseUrl = process.env.PROVISIONING_BASE_URL || new URL(request.url).origin
  const requestFile = new URL(request.url).pathname.split('/').pop() || ''
  const tenantSlug = new URL(request.url).searchParams.get('tenant') || ''
  const script = getHotspotBundleScript(file, assetBaseUrl, tenantSlug) || getHotspotBundleScript(requestFile, assetBaseUrl, tenantSlug)

  if (script) {
    return new Response(script, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  }

  const normalizedFile = String(file || '').trim().toLowerCase()
  const staticFileName = normalizedFile.includes('.')
    ? normalizedFile
    : ['login', 'status', 'logout', 'error', 'alogin'].includes(normalizedFile)
      ? `${normalizedFile}.html`
      : ''

  if (staticFileName && hotspotAssetContentTypes[staticFileName]) {
    try {
      const fileContents = await readFile(join(process.cwd(), 'public', 'hotspot-assets', staticFileName), 'utf8')
      return new Response(fileContents, {
        status: 200,
        headers: {
          'content-type': hotspotAssetContentTypes[staticFileName],
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
      })
    } catch {
      // fall through to the 404 below
    }
  }

  return new Response('Hotspot bundle file not found.', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export const dynamic = 'force-dynamic'
