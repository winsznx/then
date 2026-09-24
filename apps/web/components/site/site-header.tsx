'use client'

import { Wordmark } from '@then/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CloseIcon, ExternalIcon, MenuIcon } from '@/components/icons'

const NAV = [
  { href: '/inspect', label: 'Inspect' },
  { href: '/challenge', label: 'Challenge' },
  { href: '/corpus', label: 'Evidence' },
  { href: '/method', label: 'Method' },
  { href: '/limits', label: 'Limits' },
] as const

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

function useScrolledPast(threshold: number): boolean {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > threshold,
    () => false,
  )
}

export function SiteHeader({ githubUrl }: { githubUrl: string }) {
  const pathname = usePathname()
  const scrolled = useScrolledPast(80)
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const [openedAt, setOpenedAt] = useState(pathname)

  // Closing on navigation is derived from the route, not synced in an effect.
  const menuOpen = open && openedAt === pathname

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header
      className={`sticky top-0 z-[var(--z-header)] bg-canvas transition-[height,border-color] duration-[var(--dur-ui)] ${
        scrolled ? 'border-b border-rule' : 'border-b border-transparent'
      }`}
    >
      <div
        className={`page flex items-center justify-between gap-6 transition-[height] duration-[var(--dur-ui)] ${
          scrolled ? 'h-[var(--header-h-condensed)]' : 'h-[var(--header-h)]'
        }`}
      >
        <Link href="/" className="shrink-0 rounded-sm" aria-label="THEN home">
          <Wordmark className="h-[22px] w-auto" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`t-ui link-quiet ${active ? 'text-ink [background-size:100%_1px]' : 'text-ink-soft hover:text-ink'}`}
              >
                {item.label}
              </Link>
            )
          })}
          <a
            href={githubUrl}
            className="t-ui link-quiet inline-flex items-center gap-1 text-ink-soft hover:text-ink"
            rel="noreferrer"
          >
            GitHub
            <ExternalIcon size={14} />
            <span className="sr-only">(opens GitHub)</span>
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {pathname === '/inspect' ? null : (
            <Link
              href="/inspect"
              className="t-ui inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft max-lg:px-3"
            >
              <span className="max-sm:hidden">Check a claim</span>
              <span className="sm:hidden">Check</span>
            </Link>
          )}
          <button
            ref={menuButton}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-band lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => {
              setOpen(!menuOpen)
              setOpenedAt(pathname)
            }}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav id="site-menu" aria-label="Menu" className="border-t border-rule bg-canvas lg:hidden">
          <ul className="page flex flex-col py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex h-12 items-center border-b border-rule text-[17px] text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={githubUrl}
                rel="noreferrer"
                className="flex h-12 items-center gap-2 text-[17px] text-ink"
              >
                GitHub <ExternalIcon size={16} />
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
