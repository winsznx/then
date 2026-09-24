import { CHAIN_DISPLAY, CLAIM_TYPE_DISPLAY, claimSentence, type PublicReceipt } from '@then/core'
import type { VerifyReport } from '@then/receipt'

const SUPPORT: Record<string, string> = { YES: 'YES', NO: 'NO', UNKNOWN: 'UNKNOWN' }

export function receiptSummary(receipt: PublicReceipt, location?: string): string {
  const c = receipt.claim
  const lines = [
    '',
    `  ${claimSentence(c)}`,
    `  ${CHAIN_DISPLAY[c.chain]} · ${CLAIM_TYPE_DISPLAY[c.claim_type]} · cutoff ${receipt.evidence.historical_cutoff} (UTC)`,
    '',
    `  TODAY'S LABELS ON THAT DATE   support ${SUPPORT[receipt.comparison.live_label_replay_support]}`,
    `  AS-OF COHORT THAT DATE        support ${SUPPORT[receipt.comparison.asof_support]}`,
    '',
    `  VERDICT  ${receipt.verdict}`,
    `  ${receipt.comparison.public_explanation}`,
    '',
    `  receipt ${receipt.receipt_id} · ${receipt.origin} · ${receipt.generated_at}`,
    `  threshold $${Math.round(receipt.evidence.threshold.usd).toLocaleString('en-US')} (${receipt.evidence.threshold.basis}) · ${receipt.commitments.payload_count} source payloads · Powered by Nansen API`,
  ]
  if (location) lines.push(`  saved ${location}`)
  lines.push('')
  return lines.join('\n')
}

export function verifyReportText(title: string, report: VerifyReport): string {
  const lines = [`${title}: ${report.ok ? 'PASS' : 'FAIL'}`]
  if (report.signer) lines.push(`  signer ${report.signer.role} key ${report.signer.key_id}`)
  for (const check of report.checks) {
    lines.push(
      `  ${check.ok ? 'ok  ' : 'FAIL'} ${check.name}${check.detail ? ` · ${check.detail}` : ''}`,
    )
  }
  return lines.join('\n')
}
