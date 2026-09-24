import type { MetadataRoute } from 'next'
import { env } from '@/lib/server/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${env.publicBaseUrl}/sitemap.xml`,
  }
}
