import type { MetadataRoute } from 'next'
import { env } from '@/lib/server/env'

/** Built per request so the base URL is the deployment's, not the build machine's. */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${env.publicBaseUrl}/sitemap.xml`,
  }
}
