import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decide, parseClaim } from '@then/core'
import { referenceEvaluate } from '@then/engine-reference'
import { SCENARIOS, scenarioWindow, type Scenario } from '@then/fixtures'
import { describe, expect, it } from 'vitest'
import { evaluate, project, type EngineInput } from '../src'

function inputFor(scenario: Scenario): EngineInput {
  const window = scenarioWindow(scenario)
  return {
    method_version: scenario.method_version,
    claim: scenario.claim,
    window,
    settlement: scenario.settlement,
    ablation: scenario.ablation,
    surface_available: scenario.surface_available,
    ...(scenario.unavailable_reason ? { unavailable_reason: scenario.unavailable_reason } : {}),
    calibration_window: scenario.calibration_window,
    projections: project(scenario.records, {
      window,
      chain: scenario.claim.chain,
      token_address: scenario.claim.token_address,
    }),
  }
}

describe('engine scenarios (synthetic fixtures)', () => {
  for (const scenario of SCENARIOS) {
    describe(`${scenario.id}: ${scenario.title}`, () => {
      it(`stamps ${scenario.expected.verdict}`, () => {
        // #given
        const input = inputFor(scenario)
        // #when
        const result = evaluate(input)
        // #then
        expect(result.verdict).toBe(scenario.expected.verdict)
      })

      it(`gives ${scenario.expected.reason} as the rule reason`, () => {
        // #given
        const input = inputFor(scenario)
        // #when
        const result = evaluate(input)
        // #then
        expect(result.reasons).toContain(scenario.expected.reason)
      })

      it('reports both support states', () => {
        // #given
        const input = inputFor(scenario)
        // #when
        const result = evaluate(input)
        // #then
        expect([result.asof.support, result.live.support]).toEqual([
          scenario.expected.asof_support,
          scenario.expected.live_support,
        ])
      })

      it('asks for the historical lookup only when contamination depends on it', () => {
        // #given
        const input = inputFor(scenario)
        // #when
        const result = evaluate(input)
        // #then
        expect(result.attribution_request?.wallet ?? null).toBe(
          scenario.expected.attribution_request ?? null,
        )
      })

      it('agrees with the reference implementation', () => {
        // #given
        const input = inputFor(scenario)
        // #when
        const result = evaluate(input)
        const reference = referenceEvaluate(input, result.decision_inputs.label_drift_attributed)
        // #then
        expect({
          verdict: reference.verdict,
          asof: reference.asof_support,
          live: reference.live_support,
        }).toEqual({
          verdict: result.verdict,
          asof: result.asof.support,
          live: result.live.support,
        })
      })

      it('matches the reference threshold within float tolerance', () => {
        // #given
        const input = inputFor(scenario)
        // #when
        const result = evaluate(input)
        const reference = referenceEvaluate(input, result.decision_inputs.label_drift_attributed)
        // #then
        expect(
          Math.abs(reference.threshold_usd - result.threshold.usd) / result.threshold.usd,
        ).toBeLessThan(1e-6)
      })

      it('produces the verdict that the public decision rule gives for its own inputs', () => {
        // #given
        const result = evaluate(inputFor(scenario))
        // #when
        const recomputed = decide(result.decision_inputs)
        // #then
        expect(recomputed.verdict).toBe(result.verdict)
      })

      it('is deterministic', () => {
        // #given
        const input = inputFor(scenario)
        // #when
        const first = JSON.stringify(evaluate(input))
        const second = JSON.stringify(evaluate(inputFor(scenario)))
        // #then
        expect(second).toBe(first)
      })
    })
  }
})

describe('verdict invariants', () => {
  it('never emits VALID or CONTAMINATED under ablation, for any scenario', () => {
    // #given
    const verdicts = SCENARIOS.map(
      (scenario) => evaluate({ ...inputFor(scenario), ablation: true }).verdict,
    )
    // #then
    expect(new Set(verdicts)).toEqual(new Set(['INSUFFICIENT']))
  })

  it('never emits VALID when as-of support is not YES', () => {
    // #given
    const results = SCENARIOS.map((scenario) => evaluate(inputFor(scenario)))
    // #when
    const violations = results.filter((r) => r.verdict === 'VALID' && r.asof.support !== 'YES')
    // #then
    expect(violations).toEqual([])
  })

  it('never emits CONTAMINATED without current-label support and attribution', () => {
    // #given
    const results = SCENARIOS.map((scenario) => evaluate(inputFor(scenario)))
    // #when
    const violations = results.filter(
      (r) =>
        r.verdict === 'CONTAMINATED' &&
        (r.live.support !== 'YES' ||
          r.asof.support !== 'NO' ||
          r.decision_inputs.label_drift_attributed !== true),
    )
    // #then
    expect(violations).toEqual([])
  })

  it('never emits a verdict outside the three public verdicts', () => {
    // #given
    const verdicts = new Set(SCENARIOS.map((scenario) => evaluate(inputFor(scenario)).verdict))
    // #then
    expect([...verdicts].every((v) => ['VALID', 'CONTAMINATED', 'INSUFFICIENT'].includes(v))).toBe(
      true,
    )
  })
})

describe('reason details', () => {
  it('flags truncated sources', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'P2')!
    const records = scenario.records.map((r) =>
      r.source === 'live_trades' ? { ...r, truncated: true } : r,
    )
    // #when
    const result = evaluate(inputFor({ ...scenario, records }))
    // #then
    expect(result.reasons).toContain('ROW_CAP')
  })

  it('never decides from a capped as-of source', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'P2')!
    const records = scenario.records.map((r) =>
      r.source === 'asof_trades' ? { ...r, truncated: true } : r,
    )
    // #when
    const result = evaluate(inputFor({ ...scenario, records }))
    // #then
    expect({ asof: result.asof.support, verdict: result.verdict }).toEqual({
      asof: 'UNKNOWN',
      verdict: 'INSUFFICIENT',
    })
  })

  it('names the upstream failure behind a missing as-of side', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'P4')!
    // #when
    const result = evaluate(inputFor(scenario))
    // #then
    expect(result.reasons[0]).toBe('UPSTREAM_ERROR')
  })

  it('falls back to the minimum threshold without price data', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'no-price')!
    // #when
    const result = evaluate(inputFor(scenario))
    // #then
    expect(result.threshold).toMatchObject({ usd: 2000, basis: 'min_usd' })
  })

  it('marks recent claim dates', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'P2')!
    // #when
    const result = evaluate({ ...inputFor(scenario), settlement: 'recent' })
    // #then
    expect(result.reasons).toContain('RECENT_WINDOW')
  })

  it('records Fund inclusion for dates before the cohort change', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'P2')!
    const claim = {
      ...scenario.claim,
      sm_label_set: [...scenario.claim.sm_label_set, 'Fund' as const],
    }
    // #when
    const result = evaluate({ ...inputFor(scenario), claim })
    // #then
    expect(result.reasons).toContain('FUND_INCLUDED')
  })

  it('computes contamination shares for the planted case', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'P1')!
    // #when
    const result = evaluate(inputFor(scenario))
    // #then
    expect(result.summary.wallets).toMatchObject({
      live_only_wallets: 1,
      overlap_wallets: 1,
      contamination_usd_share: 5000 / 5500,
    })
  })
})

describe('method versions', () => {
  it('judges a flow claim against the claim floor under 2026-09-24.2', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'flow-floor')!
    // #when
    const result = evaluate(inputFor(scenario))
    // #then
    expect({ verdict: result.verdict, threshold: result.threshold.usd }).toEqual({
      verdict: 'VALID',
      threshold: 2000,
    })
  })

  it('replays an original 2026-09-24 receipt under its own volume-relative rule', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'flow-floor')!
    // #when
    const result = evaluate({ ...inputFor(scenario), method_version: '2026-09-24' })
    // #then
    expect({ verdict: result.verdict, threshold: result.threshold.usd }).toEqual({
      verdict: 'INSUFFICIENT',
      threshold: 20000,
    })
  })

  it('keeps the volume-relative threshold for holdings in both methods', () => {
    // #given
    const scenario = SCENARIOS.find((s) => s.id === 'P8')!
    // #when
    const thresholds = (['2026-09-24', '2026-09-24.2'] as const).map(
      (method) => evaluate({ ...inputFor(scenario), method_version: method }).threshold.basis,
    )
    // #then
    expect(thresholds).toEqual(['volume', 'volume'])
  })
})

describe('claim parsing rules', () => {
  it('rejects Fund on or after the cohort change', () => {
    // #given
    const input = {
      claim_type: 'SM_BOUGHT',
      chain: 'ethereum',
      token_address: '0x0000000000000000000000000000000000f1c7e0',
      as_of_date: '2026-09-10',
      sm_label_set: ['Smart Trader', 'Fund'],
    }
    // #when
    const parsed = parseClaim(input)
    // #then
    expect(parsed.ok).toBe(false)
  })

  it('rejects a Solana-style address on an EVM chain', () => {
    // #when
    const parsed = parseClaim({
      claim_type: 'SM_BOUGHT',
      chain: 'ethereum',
      token_address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      as_of_date: '2026-06-12',
    })
    // #then
    expect(parsed.ok).toBe(false)
  })
})

describe('engine purity', () => {
  it('has no network, UI, or LLM imports', () => {
    // #given
    const here = dirname(fileURLToPath(import.meta.url))
    const sources = readdirSync(join(here, '../src')).map((file) =>
      readFileSync(join(here, '../src', file), 'utf8'),
    )
    const forbidden =
      /from ['"](node:http|node:https|undici|axios|react|next|openai|@anthropic-ai|ai|@then\/nansen['"]|@then\/stamp|@then\/store)/
    // #then
    expect(sources.filter((source) => forbidden.test(source))).toEqual([])
  })

  it('evaluates with fetch unavailable', () => {
    // #given
    const original = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('network is not allowed in the engine')
    }) as typeof fetch
    try {
      // #when
      const verdicts = SCENARIOS.map((scenario) => evaluate(inputFor(scenario)).verdict)
      // #then
      expect(verdicts).toHaveLength(SCENARIOS.length)
    } finally {
      globalThis.fetch = original
    }
  })
})
