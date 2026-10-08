import { NextRequest } from 'next/server'
import { getHotspotPortalResponse } from '@/lib/hotspot-portal-response'

export function GET(request: NextRequest) {
  return getHotspotPortalResponse(request)
}

export const dynamic = 'force-dynamic'
