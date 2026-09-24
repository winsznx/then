/**
 * Test-only values. The Nansen key is a sentinel that must never appear in anything the browser
 * receives; the seeds sign synthetic receipts in a throwaway database.
 */
export const E2E_PORT = 3100
export const MOCK_NANSEN_PORT = 3199
export const SENTINEL_KEY = 'e2e-sentinel-nansen-key-7c1f4a90b2'
export const ADMIN_TOKEN = 'e2e-admin-token-3b8d2e61a0f4'
export const LOCAL_SEED = '1f'.repeat(32)
/** Public key for LOCAL_SEED; the seed script checks that the two still match. */
export const LOCAL_PUBLIC_KEY = '43046bfe4092b3e94994eada15dcc20d8aaa07b658fd3954eb8e0efb8bdca5de'
export const HOSTED_SEED = '2e'.repeat(32)
export const SESSION_SECRET = '3d'.repeat(32)
export const STATE_DIR = 'e2e/.state'

/** The synthetic claim the mock serves (fixture scenario P2: an Ethereum buy on 2026-06-12). */
export const MOCK_CLAIM = {
  claim_type: 'SM_BOUGHT',
  chain: 'ethereum',
  token_address: '0x0000000000000000000000000000000000f1c7e0',
  as_of_date: '2026-06-12',
} as const
