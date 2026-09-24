import 'server-only'
import { METHOD_VERSION } from '@then/core'
import { getRepo } from './db'
import { env } from './env'
import { hostedSigningKey } from './keys'
import { log } from './nansen'
import { stampingAvailability, type StampUnavailable } from './stamp'

export interface DeploymentStatus {
  checkedAt: string
  /** Null when a new stamp could start now. */
  stamping: StampUnavailable | null
  /** Null when the database did not answer. */
  counts: { receipts: number; cases: number; corpusRuns: number } | null
  historical: boolean
  stampsPerHour: number
  tradeMode: 'paper' | 'live'
  methodVersion: string
  signingKeyId: string | null
  commit: string | null
}

async function publicCounts(): Promise<DeploymentStatus['counts']> {
  try {
    return await (await getRepo()).publicCounts()
  } catch (error) {
    log('error', { event: 'status.database_unreachable', error: String(error) })
    return null
  }
}

/** What this deployment can do right now. Never includes the credit balance or any secret. */
export async function deploymentStatus(): Promise<DeploymentStatus> {
  const [stamping, counts] = await Promise.all([stampingAvailability(), publicCounts()])
  return {
    checkedAt: new Date().toISOString(),
    stamping,
    counts,
    historical: !env.disableHistorical,
    stampsPerHour: env.stampsPerHour,
    tradeMode: env.tradeMode,
    methodVersion: METHOD_VERSION,
    signingKeyId: hostedSigningKey()?.key_id ?? null,
    commit: env.gitSha,
  }
}
