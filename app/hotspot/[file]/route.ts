import { getHotspotBundleScript } from '@/lib/router-provisioning'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params
  const script = getHotspotBundleScript(file)

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
