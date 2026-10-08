import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="not-found-page">
      <p>404</p>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link href="/dashboard">Return to dashboard</Link>
    </main>
  )
}
