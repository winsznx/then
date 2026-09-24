import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STATE_DIR } from './constants'

export interface SeedState {
  receipts: Record<'P1' | 'P2' | 'P3', { receipt_id: string; verdict: string }>
  local_public_key: string
}

export function seed(): SeedState {
  return JSON.parse(readFileSync(resolve(STATE_DIR, 'seed.json'), 'utf8')) as SeedState
}
