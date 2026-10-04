export type C2BPayload = {
  TransID?: unknown
  TransTime?: unknown
  TransAmount?: unknown
  BusinessShortCode?: unknown
  BillRefNumber?: unknown
  MSISDN?: unknown
  [key: string]: unknown
}

export function parseC2bTransaction(payload: C2BPayload) {
  const transactionId = typeof payload.TransID === 'string' ? payload.TransID.trim().toUpperCase() : ''
  const billReference = typeof payload.BillRefNumber === 'string' ? payload.BillRefNumber.trim() : ''
  const amount = Number(payload.TransAmount)
  const phoneDigits = typeof payload.MSISDN === 'string' ? payload.MSISDN.replace(/\D/g, '') : ''
  const phone = /^254(?:7|1)\d{8}$/.test(phoneDigits) ? phoneDigits : null
  let transactionAt: Date | null = null
  if (typeof payload.TransTime === 'string' && /^\d{14}$/.test(payload.TransTime)) {
    const value = payload.TransTime
    const year = Number(value.slice(0, 4))
    const month = Number(value.slice(4, 6)) - 1
    const day = Number(value.slice(6, 8))
    const hour = Number(value.slice(8, 10))
    const minute = Number(value.slice(10, 12))
    const second = Number(value.slice(12, 14))
    const normalizedLocalTimestamp = new Date(Date.UTC(year, month, day, hour, minute, second))
    if (normalizedLocalTimestamp.getUTCFullYear() === year &&
        normalizedLocalTimestamp.getUTCMonth() === month &&
        normalizedLocalTimestamp.getUTCDate() === day &&
        normalizedLocalTimestamp.getUTCHours() === hour &&
        normalizedLocalTimestamp.getUTCMinutes() === minute &&
        normalizedLocalTimestamp.getUTCSeconds() === second) {
      transactionAt = new Date(normalizedLocalTimestamp.getTime() - 3 * 60 * 60 * 1000)
    }
  }

  if (!/^[A-Z0-9]{8,20}$/.test(transactionId)) throw new Error('Invalid M-Pesa transaction ID.')
  if (billReference.length < 1 || billReference.length > 64 || /[\u0000-\u001f\u007f]/.test(billReference)) throw new Error('Invalid PayBill account reference.')
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid M-Pesa transaction amount.')
  if (!transactionAt) throw new Error('Invalid M-Pesa transaction timestamp.')
  return { transactionId, billReference, amount, phone, transactionAt }
}
