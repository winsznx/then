import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="page py-24 md:py-36">
      <p className="t-meta">Not found</p>
      <h1 className="t-h2 mt-4 max-w-[18ch]">Nothing is recorded at this address.</h1>
      <p className="t-lead mt-5 max-w-[52ch]">
        The page may have moved, or the link was cut short when it was shared.
      </p>
      <Link
        href="/inspect"
        className="t-ui mt-8 inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
      >
        Check a claim
      </Link>
    </div>
  )
}
