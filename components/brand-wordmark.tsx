type BrandWordmarkProps = {
  primary: string
  accent?: string
  className?: string
  tone?: 'dark' | 'light'
}

export function BrandWordmark({ primary, accent, className = '', tone = 'light' }: BrandWordmarkProps) {
  return (
    <span className={`brand-wordmark brand-wordmark-${tone} ${className}`.trim()}>
      <span>{primary}</span>
      {accent && <> <span className="brand-wordmark-accent">{accent}</span></>}
    </span>
  )
}
