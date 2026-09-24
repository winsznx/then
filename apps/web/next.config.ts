import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { NextConfig } from 'next'

// The monorepo keeps one .env at its root. Server-only: nothing here is NEXT_PUBLIC_. Variables
// already in the environment win; THEN_ENV_FILE=none skips the file (the e2e suite sets it).
const envFile = process.env.THEN_ENV_FILE ?? resolve(process.cwd(), '../../.env')
if (envFile !== 'none' && existsSync(envFile)) process.loadEnvFile(envFile)

const nextConfig: NextConfig = {
  // A self-contained server for container hosting; tracing starts at the monorepo root. The
  // Cloudflare build (vinext, THEN_BUILD_TARGET=cloudflare) produces a Worker instead.
  ...(process.env.THEN_BUILD_TARGET === 'cloudflare' ? {} : { output: 'standalone' as const }),
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    '@then/challenge',
    '@then/core',
    '@then/corpus',
    '@then/engine',
    '@then/intake',
    '@then/mcp',
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
