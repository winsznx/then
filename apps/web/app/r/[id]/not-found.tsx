import Link from 'next/link'

export default function ReceiptNotFound() {
  return (
    <div className="page py-24 md:py-36">
      <p className="t-meta">Receipt not found</p>
      <h1 className="t-h2 mt-4 max-w-[20ch]">No receipt with this id is published here.</h1>
      <p className="t-lead mt-5 max-w-[56ch]">
        Receipt ids are rcpt_ followed by 20 letters and digits. A receipt stamped on another
        deployment, or kept private, cannot be shown on this one. A downloaded receipt can still be
        checked offline with the verifier.
      </p>
      <Link
        href="/corpus"
        className="t-ui mt-8 inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
      >
        Browse published receipts
      </Link>
    </div>
  )
}
