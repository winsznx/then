import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RECEIPT_ID_PATTERN, hashCanonical, type PublicReceipt } from '@then/core'
import { SCENARIOS, runFromScenario } from '@then/fixtures'
import { describe, expect, it } from 'vitest'
import {
  FIXTURE_SIGNING_KEY,
  buildReceipt,
  compareReceipts,
  generateSigningKey,
  parseTrustedKeys,
  redistributionFindings,
  signPublic,
  trustedKeyOf,
  verifyFull,
  verifyPublic,
  type ReceiptBundle,
} from '../src'

const trustedKeys = [trustedKeyOf(FIXTURE_SIGNING_KEY)]

function fixtureBundle(id = 'P1'): ReceiptBundle {
  const scenario = SCENARIOS.find((s) => s.id === id)!
  return buildReceipt(runFromScenario(scenario), {
    origin: 'fixture',
    gitSha: null,
    signer: FIXTURE_SIGNING_KEY,
  })
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

describe('honest receipts', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id} passes public verification`, () => {
      // #given
      const bundle = buildReceipt(runFromScenario(scenario), {
        origin: 'fixture',
        gitSha: null,
        signer: FIXTURE_SIGNING_KEY,
      })
      // #when
      const result = verifyPublic(bundle.public, { trustedKeys })
      // #then
      expect(result.checks.filter((check) => !check.ok)).toEqual([])
    })

    it(`${scenario.id} passes full offline verification`, () => {
      // #given
      const bundle = buildReceipt(runFromScenario(scenario), {
        origin: 'fixture',
        gitSha: null,
        signer: FIXTURE_SIGNING_KEY,
      })
      // #when
      const result = verifyFull(bundle, bundle.public)
      // #then
      expect(result.checks.filter((check) => !check.ok)).toEqual([])
    })

    it(`${scenario.id} public receipt carries no private identifiers or amounts`, () => {
      // #given
      const bundle = buildReceipt(runFromScenario(scenario), {
        origin: 'fixture',
        gitSha: null,
        signer: FIXTURE_SIGNING_KEY,
      })
      // #when
      const findings = redistributionFindings(bundle.public, bundle)
      // #then
      expect(findings).toEqual([])
    })
  }

  it('uses receipt ids limited to [a-z0-9_]', () => {
    // #given
    const ids = SCENARIOS.map(
      (scenario) =>
        buildReceipt(runFromScenario(scenario), {
          origin: 'fixture',
          gitSha: null,
          signer: FIXTURE_SIGNING_KEY,
        }).receipt_id,
    )
    // #then
    expect(ids.every((id) => RECEIPT_ID_PATTERN.test(id) && /^[a-z0-9_]+$/.test(id))).toBe(true)
  })

  it('reports the fixture signer role', () => {
    // #when
    const result = verifyPublic(fixtureBundle().public, { trustedKeys })
    // #then
    expect(result.signer?.role).toBe('fixture')
  })
})

describe('tampered public receipts', () => {
  it('fail when the verdict is edited', () => {
    // #given
    const receipt = clone(fixtureBundle().public)
    receipt.verdict = 'VALID'
    // #when
    const result = verifyPublic(receipt, { trustedKeys })
    // #then
    expect(result.ok).toBe(false)
  })

  it('fail when the verdict and its decision inputs are edited consistently but not re-signed', () => {
    // #given
    const receipt = clone(fixtureBundle().public)
    receipt.verdict = 'VALID'
    receipt.decision_inputs.asof_support = 'YES'
    receipt.comparison.asof_support = 'YES'
    receipt.comparison.difference = 'NONE'
    receipt.reasons = ['ASOF_COHORT_SUPPORTS']
    // #when
    const result = verifyPublic(receipt, { trustedKeys })
    // #then
    expect(result.checks.find((check) => check.name === 'signature')?.ok).toBe(false)
  })

  it('fail when re-signed with a key the verifier does not trust', () => {
    // #given
    const { signature: _signature, ...unsigned } = clone(fixtureBundle().public)
    void _signature
    const forged = signPublic(
      { ...unsigned, verdict: 'VALID' } as Omit<PublicReceipt, 'signature'>,
      generateSigningKey('hosted'),
    )
    // #when
    const result = verifyPublic(forged, { trustedKeys })
    // #then
    expect(result.checks.find((check) => check.name === 'signature')?.ok).toBe(false)
  })

  it('fail when the claim date is edited', () => {
    // #given
    const receipt = clone(fixtureBundle().public)
    receipt.claim.as_of_date = '2026-06-13'
    // #when
    const result = verifyPublic(receipt, { trustedKeys })
    // #then
    expect(result.checks.find((check) => check.name === 'claim_hash')?.ok).toBe(false)
  })

  it('fail when a fixture receipt claims to be a live stamp', () => {
    // #given
    const { signature: _signature, ...unsigned } = clone(fixtureBundle().public)
    void _signature
    const relabelled = signPublic({ ...unsigned, origin: 'live_stamp' }, FIXTURE_SIGNING_KEY)
    // #when
    const result = verifyPublic(relabelled, { trustedKeys })
    // #then
    expect(result.checks.find((check) => check.name === 'fixture_origin_matches_key')?.ok).toBe(
      false,
    )
  })

  it('fail when unsigned and a signature is required', () => {
    // #given
    const { signature: _signature, ...unsigned } = clone(fixtureBundle().public)
    void _signature
    // #when
    const result = verifyPublic(unsigned, { trustedKeys })
    // #then
    expect(result.ok).toBe(false)
  })

  it('fail when a private field is smuggled in', () => {
    // #given
    const receipt = clone(fixtureBundle().public) as PublicReceipt & { wallets?: string[] }
    receipt.wallets = ['0x0000000000000000000000000000000000000001']
    // #when
    const result = verifyPublic(receipt, { trustedKeys })
    // #then
    expect(result.checks[0]).toMatchObject({ name: 'schema', ok: false })
  })
})

describe('tampered private bundles', () => {
  it('fail when a stored payload body changes', () => {
    // #given
    const bundle = clone(fixtureBundle())
    bundle.records[0]!.bodies[0] = bundle.records[0]!.bodies[0]!.replace('5000', '50')
    // #when
    const result = verifyFull(bundle, bundle.public)
    // #then
    expect(result.checks.find((check) => check.name === 'payload_hashes')?.ok).toBe(false)
  })

  it('fail when the stored verdict changes', () => {
    // #given
    const bundle = clone(fixtureBundle())
    bundle.internal.body.verdict = 'VALID'
    // #when
    const result = verifyFull(bundle, bundle.public)
    // #then
    expect(result.checks.find((check) => check.name === 'verdict_recomputed')?.ok).toBe(false)
  })

  it('fail when a summary number is edited', () => {
    // #given
    const bundle = clone(fixtureBundle())
    bundle.internal.body.summary.wallets!.live_net_usd = 1
    // #when
    const result = verifyFull(bundle, bundle.public)
    // #then
    expect(result.checks.find((check) => check.name === 'numbers_recomputed')?.ok).toBe(false)
  })

  it('fail when a raw response is swapped', () => {
    // #given
    const bundle = clone(fixtureBundle())
    bundle.payloads[0]!.body = '{}'
    // #when
    const result = verifyFull(bundle, bundle.public)
    // #then
    expect(result.checks.find((check) => check.name === 'raw_responses')?.ok).toBe(false)
  })
})

describe('restamp drift', () => {
  it('keeps the original and reports a restated source', () => {
    // #given
    const original = fixtureBundle('P1')
    const scenario = SCENARIOS.find((s) => s.id === 'P2')!
    const restamp = buildReceipt(runFromScenario(scenario, '2026-10-01T00:00:00.000Z'), {
      origin: 'fixture',
      gitSha: null,
      signer: FIXTURE_SIGNING_KEY,
      restampOf: original.receipt_id,
    })
    // #when
    const drift = compareReceipts(original.internal, restamp.internal)
    // #then
    expect({
      restated: drift.restated,
      verdictChanged: drift.verdict.changed,
      methodChanged: drift.method.changed,
      originalUnchanged:
        hashCanonical(original.internal.body) === original.public.commitments.internal_commitment,
    }).toEqual({
      restated: true,
      verdictChanged: true,
      methodChanged: false,
      originalUnchanged: true,
    })
  })

  it('reports a method change so a revised rule is not read as restated data', () => {
    // #given an original stamped under the previous method and a restamp under the current one
    const original = fixtureBundle('P1')
    const earlier = {
      ...original.internal,
      body: { ...original.internal.body, method_version: '2026-09-24' },
    }
    // #when the two are compared
    const drift = compareReceipts(earlier, original.internal)
    // #then the method difference is reported beside the data comparison
    expect(drift.method).toEqual({
      original: '2026-09-24',
      restamp: original.internal.body.method_version,
      changed: original.internal.body.method_version !== '2026-09-24',
    })
  })
})

describe('verifier independence', () => {
  it('imports no HTTP client', () => {
    // #given
    const here = dirname(fileURLToPath(import.meta.url))
    const sources = readdirSync(join(here, '../src')).map((file) =>
      readFileSync(join(here, '../src', file), 'utf8'),
    )
    // #then
    expect(
      sources.filter((source) =>
        /from ['"](@then\/nansen|@then\/stamp|node:http|node:https|undici)['"]/.test(source),
      ),
    ).toEqual([])
  })

  it('verifies with the network unavailable', () => {
    // #given
    const original = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('network is not allowed in the verifier')
    }) as typeof fetch
    try {
      const bundle = fixtureBundle()
      // #when
      const result = verifyFull(bundle, bundle.public)
      // #then
      expect(result.ok).toBe(true)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('trusted key configuration', () => {
  it('accepts role-prefixed keys and treats a bare key as hosted', () => {
    // #given one local key and one bare key
    const local = generateSigningKey('local')
    const hosted = generateSigningKey('hosted')
    // #when the list is parsed
    const { keys, rejected } = parseTrustedKeys(
      `local:${local.public_key_hex}, ${hosted.public_key_hex.toUpperCase()}`,
    )
    // #then both are trusted under the right roles and ids
    expect(rejected).toEqual([])
    expect(keys).toEqual([trustedKeyOf(local), trustedKeyOf(hosted)])
  })

  it('rejects unknown roles and malformed keys instead of guessing', () => {
    // #given an invented role and a truncated key
    const key = generateSigningKey('local').public_key_hex
    // #when the list is parsed
    const { keys, rejected } = parseTrustedKeys(`corpus:${key},local:${key.slice(0, 20)}`)
    // #then neither entry is trusted
    expect(keys).toEqual([])
    expect(rejected).toHaveLength(2)
  })
})
