'use client'

import { useEffect, useState } from 'react'

type ReconciliationTransaction = {
  id: string
  transactionId: string
  billReference: string
  amount: number
  phone: string | null
  transactionAt: string | null
  status: string
  matchReason: string | null
  createdAt: string
}

type Account = { accountNumber: number; customerId: string; name: string; plan: string | null; monthlyRate: number }
type LedgerPayment = { id: string; amount: number; status: string; method: string | null; paidAt: string; reference: string | null; customerName: string | null }

export function PaymentReconciliation() {
  const [transactions, setTransactions] = useState<ReconciliationTransaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [paymentLedger, setPaymentLedger] = useState<LedgerPayment[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  async function load() {
    setError('')
    const response = await fetch('/api/tenant/mobile-money', { cache: 'no-store' })
    const result = await response.json() as { transactions?: ReconciliationTransaction[]; accounts?: Account[]; paymentLedger?: LedgerPayment[]; error?: string }
    if (!response.ok) throw new Error(result.error || 'Unable to load mobile-money payments.')
    setTransactions(result.transactions || [])
    setAccounts(result.accounts || [])
    setPaymentLedger(result.paymentLedger || [])
  }

  useEffect(() => {
    let active = true
    fetch('/api/tenant/mobile-money', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { transactions?: ReconciliationTransaction[]; accounts?: Account[]; paymentLedger?: LedgerPayment[]; error?: string }
        if (!response.ok) throw new Error(result.error || 'Unable to load mobile-money payments.')
        if (active) {
          setTransactions(result.transactions || [])
          setAccounts(result.accounts || [])
          setPaymentLedger(result.paymentLedger || [])
        }
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load mobile-money payments.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function reconcile(transactionId: string) {
    const currentTransaction = transactions.find((transaction) => transaction.id === transactionId)
    const referenceAccount = accounts.find((item) => String(item.accountNumber) === currentTransaction?.billReference)
    const accountNumber = selectedAccounts[transactionId] || (referenceAccount ? String(referenceAccount.accountNumber) : '')
    if (!accountNumber) {
      setError('Choose the PPPoE account to match this payment.')
      return
    }
    setBusyId(transactionId)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/tenant/mobile-money', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId, accountNumber }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to match this payment.')
      setMessage('Payment matched. The subscriber is active through the updated expiry date.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to match this payment.')
    } finally {
      setBusyId('')
    }
  }

  const unmatchedCount = transactions.filter((transaction) => transaction.status !== 'matched').length

  return <section className="reconciliation-workspace">
    <div className="package-page-heading">
      <div><div className="provisioning-breadcrumb"><span>FINANCE</span><span className="breadcrumb-rule" /><span>PAYMENT RECONCILIATION</span></div><h1>Mobile-money <span>payments.</span></h1><p>PayBill payments with a PPPoE account number and the exact current-plan amount renew automatically. Unmatched payments wait here for staff review.</p></div>
      <button className="outline-button" onClick={() => { setLoading(true); void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to refresh payments.')).finally(() => setLoading(false)) }}>Refresh</button>
    </div>
    <div className="package-stats reconciliation-stats"><div><span>TRANSACTIONS</span><strong>{transactions.length}</strong><small>recently received</small></div><div><span>NEEDS REVIEW</span><strong>{unmatchedCount}</strong><small>unmatched or amount mismatch</small></div><div><span>ACCOUNTS</span><strong>{accounts.length}</strong><small>eligible PPPoE subscribers</small></div></div>
    {error && <p className="router-discovery-status error" role="alert">{error}</p>}
    {message && <p className="router-discovery-status" role="status">{message}</p>}
    <div className="panel plan-table-wrap">
      <div className="table-scroll"><table className="plan-table">
        <thead><tr><th>MPESA RECEIPT</th><th>REFERENCE</th><th>AMOUNT</th><th>PHONE</th><th>STATUS</th><th>MATCH</th></tr></thead>
        <tbody>
          {transactions.map((transaction) => {
            const account = accounts.find((item) => String(item.accountNumber) === transaction.billReference)
            const matched = transaction.status === 'matched'
            return <tr key={transaction.id}>
              <td><strong>{transaction.transactionId}</strong><small>{new Date(transaction.transactionAt || transaction.createdAt).toLocaleString()}</small></td>
              <td>{transaction.billReference}</td>
              <td className="plan-price">KSh {transaction.amount.toLocaleString()}</td>
              <td>{transaction.phone || '—'}</td>
              <td><span className={`plan-type ${matched ? 'plan-type-pppoe' : 'plan-type-trial'}`}>{matched ? 'Matched' : 'Review'}</span></td>
              <td>{matched ? <span>{account?.name || 'Subscriber'}{transaction.matchReason ? ` · ${transaction.matchReason}` : ''}</span> : <div className="reconciliation-match">
                <select aria-label={`Match ${transaction.transactionId} to a PPPoE account`} value={selectedAccounts[transaction.id] || (account ? String(account.accountNumber) : '')} onChange={(event) => setSelectedAccounts((current) => ({ ...current, [transaction.id]: event.target.value }))}>
                  <option value="">Select PPPoE account</option>
                  {accounts.map((item) => <option key={item.accountNumber} value={item.accountNumber}>#{item.accountNumber} · {item.name} · {item.plan || 'No plan'} · KSh {item.monthlyRate}</option>)}
                </select>
                <button className="text-button" disabled={busyId === transaction.id || accounts.length === 0} onClick={() => void reconcile(transaction.id)}>{busyId === transaction.id ? 'Matching...' : 'Match & activate'}</button>
                <small>{transaction.matchReason || 'Verify the account and exact plan amount before matching.'}</small>
              </div>}</td>
            </tr>
          })}
          {!transactions.length && <tr><td colSpan={6}>{loading ? 'Loading mobile-money transactions...' : 'No direct PayBill transactions received yet.'}</td></tr>}
        </tbody>
      </table></div>
    </div>
    <section className="panel plan-table-wrap payment-ledger">
      <div className="panel-heading"><div><h3>Confirmed payment ledger</h3><span>{paymentLedger.length} recent payments</span></div></div>
      <div className="table-scroll"><table className="plan-table">
        <thead><tr><th>DATE</th><th>CUSTOMER</th><th>AMOUNT</th><th>METHOD</th><th>REFERENCE</th></tr></thead>
        <tbody>
          {paymentLedger.map((payment) => <tr key={payment.id}>
            <td>{new Date(payment.paidAt).toLocaleString()}</td>
            <td>{payment.customerName || 'Hotspot purchase'}</td>
            <td className="plan-price">KSh {payment.amount.toLocaleString()}</td>
            <td>{payment.method || '—'}</td>
            <td>{payment.reference || '—'}</td>
          </tr>)}
          {!paymentLedger.length && <tr><td colSpan={5}>No confirmed payments recorded yet.</td></tr>}
        </tbody>
      </table></div>
    </section>
  </section>
}
