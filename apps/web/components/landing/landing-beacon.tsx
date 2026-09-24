'use client'

import { useEffect } from 'react'
import { track } from '@/lib/client/track'

export function LandingBeacon() {
  useEffect(() => {
    track('landing_view')
  }, [])
  return null
}
