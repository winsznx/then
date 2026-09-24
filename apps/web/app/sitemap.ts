import type { MetadataRoute } from 'next'
import { env } from '@/lib/server/env'

/** Built per request so the base URL is the deployment's, not the build machine's. */
export const dynamic = 'force-dynamic'

const ROUTES = [
  '/',
  '/inspect',
  '/challenge',
  '/challenge/archive',
  '/corpus',
  '/method',
  '/limits',
  '/about-data',
]

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({ url: `${env.publicBaseUrl}${route}` }))
}
