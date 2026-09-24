import type { MetadataRoute } from 'next'
import { env } from '@/lib/server/env'

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
