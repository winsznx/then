/**
 * SYNTHETIC engine scenarios. Each one pins a verdict rule. None of them is a measured result.
 */
import {
  claimWindow,
  type Claim,
  type ReasonCode,
  type Settlement,
  type SupportState,
  type Verdict,
} from '@then/core'
import { CURRENT_METHOD, type MethodVersion, type SourceRecord } from '@then/engine'
import {
  TOKEN,
  asofSnapshot,
  asofTrades,
  attribution,
  disabled,
  failed,
  flowSummary,
  liveFlows,
  liveTrades,
  price,
  wallet,
} from './builders'

export const FIXTURE_NOW = '2026-09-24T10:00:00.000Z'
export const D = '2026-06-12'
const PREV = '2026-06-11'
export const CALIBRATION_WINDOW = { from: '2026-09-15', to: '2026-09-22' }

export interface Scenario {
  id: string
  title: string
  method_version: MethodVersion
  claim: Claim
  settlement: Settlement
  ablation: boolean
  surface_available: boolean
  unavailable_reason?: 'UNSUPPORTED_CHAIN' | 'UNSUPPORTED_CLAIM_TYPE'
  calibration_window: { from: string; to: string } | null
  records: SourceRecord[]
  expected: {
    verdict: Verdict
    reason: ReasonCode
    asof_support: SupportState
    live_support: SupportState
    attribution_request?: string
  }
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    claim_type: 'SM_BOUGHT',
    chain: 'ethereum',
    token_address: TOKEN,
    token_symbol: 'FIXTURE',
    as_of_date: D,
    window_hours: 24,
    sm_label_set: [
      'Smart Trader',
      '30D Smart Trader',
      '90D Smart Trader',
      '180D Smart Trader',
      'Smart HL Perps Trader',
    ],
    // 2,000 equals 2% of the standard 100,000 volume, so every threshold is the same under both
    // published methods and the scenarios pin rules that did not change.
    min_usd: 2000,
    quote_asset: 'USD',
    ...overrides,
  }
}

/** Threshold = max(1000, 0.02 × 100,000) = 2,000 USD; price 1 USD. */
const standardPrice = price([
  { day: PREV, close: 1, volume: 100_000, volume_usd: 100_000 },
  { day: D, close: 1, volume: 100_000, volume_usd: 100_000 },
])

const base = {
  method_version: CURRENT_METHOD,
  settlement: 'settled' as Settlement,
  ablation: false,
  surface_available: true,
  calibration_window: CALIBRATION_WINDOW,
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'P1',
    title: 'Planted contamination: the big buyer only carries the label today',
    claim: claim(),
    ...base,
    records: [
      liveTrades([
        { trader: 1, action: 'BUY', amount: 5000, day: D, n: 1 },
        { trader: 2, action: 'BUY', amount: 500, day: D, n: 2 },
      ]),
      asofTrades([{ trader: 2, action: 'BUY', amount: 500, day: D, n: 2 }]),
      standardPrice,
      attribution(1, [{ day: D, label: 'Whale' }]),
    ],
    expected: {
      verdict: 'CONTAMINATED',
      reason: 'LABEL_DRIFT_ATTRIBUTED',
      asof_support: 'NO',
      live_support: 'YES',
    },
  },
  {
    id: 'P1-request',
    title: 'Contamination candidate before the historical lookup has run',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 5000, day: D, n: 1 }]),
      asofTrades([]),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'DISAGREEMENT_NOT_LABEL_DRIVEN',
      asof_support: 'NO',
      live_support: 'YES',
      attribution_request: wallet(1),
    },
  },
  {
    id: 'P1-was-sm',
    title: 'Lookup shows the wallet was Smart Money at trade time, so no contamination',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 5000, day: D, n: 1 }]),
      asofTrades([]),
      standardPrice,
      attribution(1, [{ day: D, label: '90D Smart Trader' }]),
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'DISAGREEMENT_NOT_LABEL_DRIVEN',
      asof_support: 'NO',
      live_support: 'YES',
    },
  },
  {
    id: 'P1-no-coverage',
    title: 'Lookup finds no trades in the window: history may not cover it',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 5000, day: D, n: 1 }]),
      asofTrades([]),
      standardPrice,
      attribution(1, []),
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'DISAGREEMENT_NOT_LABEL_DRIVEN',
      asof_support: 'NO',
      live_support: 'YES',
    },
  },
  {
    id: 'P2',
    title: 'Healthy control: both cohorts support the claim',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 3000, day: D, n: 1 }]),
      asofTrades([{ trader: 1, action: 'BUY', amount: 3000, day: D, n: 1 }]),
      standardPrice,
    ],
    expected: {
      verdict: 'VALID',
      reason: 'ASOF_COHORT_SUPPORTS',
      asof_support: 'YES',
      live_support: 'YES',
    },
  },
  {
    id: 'P2-left-cohort',
    title: 'VALID although today’s labels miss it: the buyer has since left the cohort',
    claim: claim(),
    ...base,
    records: [
      liveTrades([]),
      asofTrades([{ trader: 3, action: 'BUY', amount: 3000, day: D, n: 3 }]),
      standardPrice,
    ],
    expected: {
      verdict: 'VALID',
      reason: 'ASOF_COHORT_SUPPORTS',
      asof_support: 'YES',
      live_support: 'NO',
    },
  },
  {
    id: 'P3',
    title: 'Missing snapshot: an empty historical series is not zero',
    claim: claim({ claim_type: 'SM_HOLDS' }),
    ...base,
    records: [asofSnapshot([]), liveFlows([{ day: D, amount: 50_000 }]), standardPrice],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'NO_HISTORICAL_SNAPSHOT',
      asof_support: 'UNKNOWN',
      live_support: 'YES',
    },
  },
  {
    id: 'P4',
    title: 'Only current labels available: never VALID',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 9000, day: D, n: 1 }]),
      failed('asof_trades', {
        kind: 'upstream',
        code: 'upstream_unavailable',
        message: 'HTTP 503',
        http_status: 503,
      }),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'NO_HISTORICAL_SNAPSHOT',
      asof_support: 'UNKNOWN',
      live_support: 'YES',
    },
  },
  {
    id: 'P5',
    title: 'Claim date is today: refuse before any call',
    claim: claim({ as_of_date: '2026-09-24' }),
    ...base,
    settlement: 'unsettled',
    records: [],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'DATE_NOT_SETTLED',
      asof_support: 'UNKNOWN',
      live_support: 'UNKNOWN',
    },
  },
  {
    id: 'P7',
    title: 'Historical Nansen switched off: cannot stamp VALID or CONTAMINATED',
    claim: claim(),
    ...base,
    ablation: true,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 9000, day: D, n: 1 }]),
      disabled('asof_trades'),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'SPONSOR_HISTORICAL_DISABLED',
      asof_support: 'UNKNOWN',
      live_support: 'YES',
    },
  },
  {
    id: 'P8',
    title:
      'Second chain, holdings claim: today’s cohort held far more, pair calibrated on recent days',
    claim: claim({ claim_type: 'SM_HOLDS', chain: 'base' }),
    ...base,
    records: [
      liveFlows([
        { day: D, amount: 50_000 },
        { day: '2026-09-20', amount: 1000 },
        { day: '2026-09-21', amount: 1000 },
      ]),
      asofSnapshot(
        [
          { day: PREV, amount: 100 },
          { day: D, amount: 100 },
          { day: '2026-09-20', amount: 1030 },
          { day: '2026-09-21', amount: 1000 },
        ],
        'base',
      ),
      standardPrice,
    ],
    expected: {
      verdict: 'CONTAMINATED',
      reason: 'LABEL_DRIFT_ATTRIBUTED',
      asof_support: 'NO',
      live_support: 'YES',
    },
  },
  {
    id: 'P8-uncalibrated',
    title: 'Holdings pair never matches on recent days: difference not attributable',
    claim: claim({ claim_type: 'SM_HOLDS', chain: 'base' }),
    ...base,
    records: [
      liveFlows([
        { day: D, amount: 50_000 },
        { day: '2026-09-21', amount: 2000 },
      ]),
      asofSnapshot(
        [
          { day: D, amount: 100 },
          { day: '2026-09-21', amount: 1000 },
        ],
        'base',
      ),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'DISAGREEMENT_NOT_LABEL_DRIVEN',
      asof_support: 'NO',
      live_support: 'YES',
    },
  },
  {
    id: 'neither',
    title: 'Neither cohort reaches the threshold',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 100, day: D, n: 1 }]),
      asofTrades([{ trader: 1, action: 'BUY', amount: 100, day: D, n: 1 }]),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'NEITHER_SUPPORTS',
      asof_support: 'NO',
      live_support: 'NO',
    },
  },
  {
    id: 'conflict',
    title: 'As-of trades say bought, the Smart Trader flow says sold above the threshold',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 3000, day: D, n: 1 }]),
      asofTrades([{ trader: 1, action: 'BUY', amount: 3000, day: D, n: 1 }]),
      flowSummary(-5000),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'ASOF_SOURCES_CONFLICT',
      asof_support: 'UNKNOWN',
      live_support: 'YES',
    },
  },
  {
    id: 'same-wallet-delta',
    title: 'Same wallet, endpoints disagree on size: not label drift',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 3000, day: D, n: 1 }]),
      asofTrades([{ trader: 1, action: 'BUY', amount: 1000, day: D, n: 1 }]),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'DISAGREEMENT_NOT_LABEL_DRIVEN',
      asof_support: 'NO',
      live_support: 'YES',
    },
  },
  {
    id: 'sold',
    title: 'Sell claim mirrors the buy rules',
    claim: claim({ claim_type: 'SM_SOLD' }),
    ...base,
    records: [
      liveTrades([{ trader: 4, action: 'SELL', amount: 5000, day: D, n: 4 }]),
      asofTrades([]),
      standardPrice,
      attribution(4, [{ day: D, label: null }]),
    ],
    expected: {
      verdict: 'CONTAMINATED',
      reason: 'LABEL_DRIFT_ATTRIBUTED',
      asof_support: 'NO',
      live_support: 'YES',
    },
  },
  {
    id: 'no-price',
    title: 'No price data: minimum threshold and endpoint USD',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 1, usd: 2500, day: D, n: 1 }]),
      asofTrades([{ trader: 1, action: 'BUY', amount: 1, usd: 2500, day: D, n: 1 }]),
      failed('price', {
        kind: 'upstream',
        code: 'internal_error',
        message: 'HTTP 500',
        http_status: 500,
      }),
    ],
    expected: {
      verdict: 'VALID',
      reason: 'ASOF_COHORT_SUPPORTS',
      asof_support: 'YES',
      live_support: 'YES',
    },
  },
  {
    id: 'outside-window',
    title: 'Trades outside the claim day never count',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 9000, day: '2026-06-13', n: 1 }]),
      asofTrades([{ trader: 1, action: 'BUY', amount: 9000, day: '2026-06-13', n: 1 }]),
      standardPrice,
    ],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'NEITHER_SUPPORTS',
      asof_support: 'NO',
      live_support: 'NO',
    },
  },
  {
    id: 'flow-floor',
    title: 'Liquid token: Smart Money net-bought 5,000 USD against 1M USD of volume',
    claim: claim(),
    ...base,
    records: [
      liveTrades([{ trader: 1, action: 'BUY', amount: 5000, day: D, n: 1 }]),
      asofTrades([{ trader: 1, action: 'BUY', amount: 5000, day: D, n: 1 }]),
      price([
        { day: PREV, close: 1, volume: 1_000_000, volume_usd: 1_000_000 },
        { day: D, close: 1, volume: 1_000_000, volume_usd: 1_000_000 },
      ]),
    ],
    expected: {
      verdict: 'VALID',
      reason: 'ASOF_COHORT_SUPPORTS',
      asof_support: 'YES',
      live_support: 'YES',
    },
  },
  {
    id: 'perp',
    title: 'Perp claims have no dated Smart Money surface yet',
    claim: claim({ claim_type: 'SM_PERP' }),
    ...base,
    surface_available: false,
    unavailable_reason: 'UNSUPPORTED_CLAIM_TYPE',
    records: [],
    expected: {
      verdict: 'INSUFFICIENT',
      reason: 'NO_ASOF_SURFACE',
      asof_support: 'UNKNOWN',
      live_support: 'UNKNOWN',
    },
  },
]

export function scenarioWindow(scenario: Scenario) {
  return claimWindow(scenario.claim.as_of_date, scenario.claim.window_hours)
}
