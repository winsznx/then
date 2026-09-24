import { Wordmark } from '@then/ui'
import Link from 'next/link'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/inspect', label: 'Inspect' },
      { href: '/challenge', label: 'Challenge' },
      { href: '/corpus', label: 'Evidence' },
      { href: '/method', label: 'Method' },
      { href: '/limits', label: 'Limits' },
    ],
  },
  {
    title: 'Build',
    links: [
      { href: 'github', label: 'GitHub' },
      { href: '/about-data', label: 'Data and attribution' },
      { href: '/.well-known/then-receipt-keys', label: 'Receipt signing keys' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/limits#disclaimer', label: 'Disclaimer' },
      { href: '/about-data#attribution', label: 'Nansen attribution' },
    ],
  },
] as const

/** The Date Cut from the page above continues through the footer. */
export function SiteFooter({ githubUrl }: { githubUrl: string }) {
  return (
    <footer className="relative mt-auto border-t border-rule-strong bg-canvas">
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-[calc(var(--inset)+33.333%)] hidden w-[2px] bg-time md:block"
      />
      <div className="page grid gap-12 py-16 md:grid-cols-12 md:py-24">
        <div className="md:col-span-5">
          <Wordmark className="h-auto w-full max-w-[420px]" />
          <p className="t-ui mt-6 max-w-[34ch] text-ink-soft">
            Checks whether a Smart Money claim was true on the date it is used as evidence.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-6 md:col-start-7"
        >
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="t-meta mb-4">{column.title}</h2>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href === 'github' ? (
                      <a className="t-ui link-quiet text-ink" href={githubUrl} rel="noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      <Link className="t-ui link-quiet text-ink" href={link.href}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-rule">
        <div className="page flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-[22px] leading-none">History has a timestamp.</p>
          <p className="t-meta flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-nansen" />
            Powered by Nansen API
          </p>
        </div>
      </div>
    </footer>
  )
}
