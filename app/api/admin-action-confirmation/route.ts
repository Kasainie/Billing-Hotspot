import { NextRequest, NextResponse } from 'next/server'
import { requestAdminActionConfirmation } from '@/lib/db/admin-action-confirmation'

export async function POST(request: NextRequest) {
  let input: { action?: unknown; recordId?: unknown; payload?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Invalid confirmation request.' }, { status: 400 })
  }
  const action = typeof input.action === 'string' ? input.action : ''
  const recordId = typeof input.recordId === 'string' ? input.recordId : ''
  return requestAdminActionConfirmation(request, action, recordId, input.payload)
}
