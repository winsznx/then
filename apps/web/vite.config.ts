import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import vinext from 'vinext'
import { defineConfig } from 'vite'

/**
 * Cloudflare Workers build (vinext). `next dev`, `next build`, and the container image do not use
 * this file. The embedded local store is replaced by a stub: Workers always use DATABASE_URL.
 */
export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
  resolve: {
    alias: {
      '@electric-sql/pglite': fileURLToPath(
        new URL('./cloudflare/pglite-unavailable.ts', import.meta.url),
      ),
    },
  },
})
