import type { Metadata, Viewport } from 'next'
import { Geist, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { env } from '@/lib/server/env'
import './globals.css'

const display = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })

const mono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(env.publicBaseUrl),
  title: {
    default: 'THEN · Was this Smart Money then?',
    template: '%s · THEN',
  },
  description:
    "THEN checks whether a Smart Money claim was true on the day it is used as evidence, using Nansen's point-in-time data instead of treating today's labels as historical fact.",
  applicationName: 'THEN',
  openGraph: { type: 'website', siteName: 'THEN' },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  themeColor: '#F7F4ED',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="t-ui sr-only z-[var(--z-toast)] rounded-md bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteHeader githubUrl={env.githubUrl} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter githubUrl={env.githubUrl} />
      </body>
    </html>
  )
}
