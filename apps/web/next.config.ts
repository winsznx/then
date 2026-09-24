import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { NextConfig } from 'next'

// The monorepo keeps one .env at its root. Server-only: nothing here is NEXT_PUBLIC_.
const rootEnv = resolve(process.cwd(), '../../.env')
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    '@then/challenge',
    '@then/core',
    '@then/corpus',
    '@then/engine',
    '@then/intake',
    '@then/nansen',
    '@then/receipt',
    '@then/stamp',
    '@then/store',
    '@then/trade',
    '@then/ui',
  ],
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
