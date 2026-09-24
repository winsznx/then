import type { PublicReceipt, SourceClass } from '@then/core'

/** One line of the NDJSON stream POST /api/stamp returns for an accepted stamp. */
export type StampEvent =
  | { type: 'accepted'; job_id: string }
  | {
      type: 'stage'
      stage: SourceClass
      status: 'waiting' | 'running' | 'done' | 'failed' | 'disabled' | 'skipped'
    }
  | { type: 'done'; receipt: PublicReceipt }
  | { type: 'failed'; error: 'API_KEY_REJECTED' | 'STAMP_FAILED' }

export const STAMP_STREAM_TYPE = 'application/x-ndjson'
