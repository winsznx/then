'use client'

import type { PublicReceipt } from '@then/core'
import type { Check, TrustedKey, VerifyReport } from '@then/receipt'
import { CheckIcon, CloseIcon } from '@/components/icons'

const CHECK_TEXT: Record<string, string> = {
  schema: 'Receipt format is the published schema',
  claim_hash: 'Claim hash matches the claim',
  receipt_id: 'Receipt id derives from the claim, the stamp time, and the evidence commitment',
  payload_root: 'Source hash root matches the listed source hashes',
  verdict_rule: 'Verdict recomputes from the published decision inputs',
  rule_reason_listed: 'The deciding reason is listed',
  public_reasons_only: 'Only public reasons are published',
  comparison_consistent: 'Both support states match the decision inputs',
  cutoff_matches_claim: 'Cutoff and window end on the claim date',
  signature: 'Signature verifies against a published key',
  fixture_origin_matches_key: 'Fixture key signs only fixture receipts',
  fixture_not_signed_as_live: 'A fixture receipt cannot pass as a live stamp',
}

const ROLE_TEXT: Record<TrustedKey['role'], string> = {
  hosted: "this deployment's hosted key",
  local: "the operator's command-line key",
  fixture: 'the public fixture key, which signs synthetic receipts only',
}

export type VerifyState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; report: VerifyReport }
  | { kind: 'error'; message: string }

/**
 * Runs the public verifier in this browser: it downloads the receipt and the published keys and
 * repeats every check itself, so the answer does not rest on the server saying "valid".
 */
export async function verifyInBrowser(receiptId: string): Promise<VerifyState> {
  const [receiptResponse, keysResponse] = await Promise.all([
    fetch(`/api/receipt/${receiptId}`, { headers: { accept: 'application/json' } }),
    fetch('/.well-known/then-receipt-keys', { headers: { accept: 'application/json' } }),
  ])
  if (!receiptResponse.ok)
    return { kind: 'error', message: 'The receipt could not be downloaded for checking.' }
  if (!keysResponse.ok)
    return { kind: 'error', message: 'The published signing keys could not be downloaded.' }
  const receipt = (await receiptResponse.json()) as PublicReceipt
  const { keys } = (await keysResponse.json()) as { keys: TrustedKey[] }
  const { verifyPublic } = await import('@then/receipt')
  return { kind: 'done', report: verifyPublic(receipt, { trustedKeys: keys }) }
}

function CheckRow({ check }: { check: Check }) {
  return (
    <li className="flex gap-3 py-2">
      {check.ok ? (
        <CheckIcon size={16} className="mt-0.5 shrink-0 text-ink" />
      ) : (
        <CloseIcon size={16} className="mt-0.5 shrink-0 text-ink" />
      )}
      <span className="t-ui text-ink-soft">
        <span className="sr-only">{check.ok ? 'Passed: ' : 'Failed: '}</span>
        {CHECK_TEXT[check.name] ?? check.name}
        {!check.ok && check.detail ? <span className="t-meta block">{check.detail}</span> : null}
      </span>
    </li>
  )
}

export function VerifyPanel({ state, receiptId }: { state: VerifyState; receiptId: string }) {
  if (state.kind === 'idle') return null
  return (
    <div className="border-t border-rule px-5 py-5 md:px-8" aria-live="polite">
      {state.kind === 'running' ? (
        <p className="t-ui text-ink-soft">Checking {receiptId} in this browser…</p>
      ) : null}
      {state.kind === 'error' ? <p className="t-ui font-medium text-ink">{state.message}</p> : null}
      {state.kind === 'done' ? (
        <>
          <p className="t-ui font-medium text-ink">
            {state.report.ok
              ? `Integrity verified in this browser. All ${state.report.checks.length} checks passed.`
              : `Integrity check failed. ${state.report.checks.filter((check) => !check.ok).length} of ${state.report.checks.length} checks did not pass. Do not rely on this receipt.`}
          </p>
          {state.report.signer ? (
            <p className="t-ui mt-1 text-ink-soft">
              Signed with {ROLE_TEXT[state.report.signer.role]} ({state.report.signer.key_id}).
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {state.report.checks.map((check) => (
              <CheckRow key={check.name} check={check} />
            ))}
          </ul>
          <p className="t-ui mt-3 text-meta">
            Offline, the same checks run with{' '}
            <code className="font-mono text-[13px] text-ink">
              then verify-public {receiptId}.public.json
            </code>
            .
          </p>
        </>
      ) : null}
    </div>
  )
}
