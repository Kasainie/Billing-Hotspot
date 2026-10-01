import { getHotspotBundleScript } from '@/lib/router-provisioning'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params
  const assetBaseUrl = process.env.PROVISIONING_BASE_URL || new URL(request.url).origin
  const script = getHotspotBundleScript(file, assetBaseUrl)

  if (!script) {
    return new Response('Hotspot bundle file not found.', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  }

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

export const dynamic = 'force-dynamic'
