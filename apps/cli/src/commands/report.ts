import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  CHAIN_DISPLAY,
  CLAIM_TYPE_DISPLAY,
  REASONS,
  VERDICT_HEADLINES,
  claimSentence,
  type PublicReceipt,
} from '@then/core'
import { verifyPublic } from '@then/receipt'
import { FsReceiptStore, locateReceipt } from '@then/store'
import { color, verdictColor } from '@then/ui/tokens'
import { CliError, EXIT, trustedKeys } from '../config'

function escape(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function row(term: string, detail: string): string {
  return `<div class="row"><dt>${escape(term)}</dt><dd>${detail}</dd></div>`
}

/** One self-contained page: no scripts, no external requests, public receipt fields only. */
export function reportHtml(
  receipt: PublicReceipt,
  verified: { ok: boolean; signer: string | null },
): string {
  const tint = verdictColor[receipt.verdict]
  const sources = receipt.evidence.sources.map(
    (source) => `${source.class.replaceAll('_', ' ')}: ${source.status.replace('_', ' ')}`,
  )
  const notes = receipt.reasons.map((code) => `<li>${escape(REASONS[code].text)}</li>`).join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(`THEN ${receipt.verdict}: ${claimSentence(receipt.claim)}`)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${color.paper0}; color: ${color.ink0}; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 48px 24px 72px; }
  .meta, dt, code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; color: ${color.ink2}; }
  h1 { font: 400 40px/1.08 Georgia, "Iowan Old Style", serif; margin: 12px 0 0; letter-spacing: -0.01em; }
  .frame { margin-top: 32px; border: 1px solid ${color.lineStrong}; border-radius: 12px; overflow: hidden; background: ${color.paper1}; }
  .sides { display: grid; grid-template-columns: 1fr 1fr; position: relative; }
  .sides::after { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; margin-left: -1px; background: ${color.timeBlue}; }
  .side { padding: 24px 28px; }
  .asof { background: ${color.timeBlueWash}; color: ${color.timeBlueDeep}; }
  .support { font-size: 40px; font-weight: 600; line-height: 1; margin-top: 6px; }
  .verdict { padding: 28px; border-top: 1px solid ${color.line0}; background: ${tint.wash}; }
  .word { font-size: 52px; font-weight: 600; letter-spacing: 0.02em; color: ${tint.ink}; line-height: 1; }
  dl { margin: 0; padding: 24px 28px; border-top: 1px solid ${color.line0}; }
  .row { display: grid; grid-template-columns: 180px 1fr; gap: 12px; padding: 6px 0; border-top: 1px dashed ${color.line0}; }
  .row:first-child { border-top: 0; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .hash { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
  section { margin-top: 32px; }
  .nowrap { white-space: nowrap; }
  .banner { margin: 12px 0 0; padding: 8px 12px; border: 1px solid ${color.ink0}; border-radius: 4px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  ul { margin: 8px 0 0; padding-left: 20px; }
  @media (max-width: 640px) { .sides { grid-template-columns: 1fr; } .sides::after { display: none; } .row { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <p class="meta">THEN receipt ${escape(receipt.receipt_id)} · ${escape(receipt.origin)} · ${escape(receipt.generated_at)} · Powered by Nansen API</p>
  ${receipt.origin === 'fixture' ? '<p class="banner">FIXTURE · SYNTHETIC DATA. Not a real market result.</p>' : ''}
  <h1>${escape(claimSentence(receipt.claim)).replace(receipt.claim.as_of_date, `<span class="nowrap">${receipt.claim.as_of_date}</span>`)}</h1>
  <p class="meta">${escape(CHAIN_DISPLAY[receipt.claim.chain])} · ${escape(CLAIM_TYPE_DISPLAY[receipt.claim.claim_type])} · window ${escape(receipt.evidence.window.from)} to ${escape(receipt.evidence.window.to)} (UTC)</p>
  <div class="frame">
    <div class="sides">
      <div class="side"><div>Today's labels on that date</div><div class="meta">Support</div><div class="support">${escape(receipt.comparison.live_label_replay_support)}</div></div>
      <div class="side asof"><div>As of ${escape(receipt.claim.as_of_date)}</div><div class="meta">Support</div><div class="support">${escape(receipt.comparison.asof_support)}</div></div>
    </div>
    <div class="verdict">
      <div class="meta">Verdict</div>
      <div class="word">${escape(receipt.verdict)}</div>
      <p><strong>${escape(VERDICT_HEADLINES[receipt.verdict])}</strong><br>${escape(receipt.comparison.public_explanation)}</p>
    </div>
    <dl>
      ${row('Historical cutoff', `End of ${escape(receipt.evidence.historical_cutoff)}, UTC`)}
      ${row('Threshold', `${escape(`$${Math.round(receipt.evidence.threshold.usd).toLocaleString('en-US')}`)} (${escape(receipt.evidence.threshold.rule)})`)}
      ${row('Sources', escape(sources.join('; ')))}
      ${row('Settlement', escape(receipt.evidence.settlement))}
      ${row('Method', `${escape(receipt.method_version)} · engine ${escape(receipt.engine_version)}`)}
      ${row('Claim hash', `<span class="hash">${escape(receipt.claim_hash)}</span>`)}
      ${row('Payload root', `<span class="hash">${escape(receipt.commitments.payload_root)}</span> (${receipt.commitments.payload_count} responses)`)}
      ${row('Private commitment', `<span class="hash">${escape(receipt.commitments.internal_commitment)}</span>`)}
      ${row('Signature', receipt.signature ? `<span class="hash">${escape(receipt.signature.key_id)}</span>` : 'unsigned')}
      ${row('Checked when written', verified.ok ? `passed public verification${verified.signer ? `, signed by the ${escape(verified.signer)} key` : ''}` : 'did NOT pass public verification')}
    </dl>
  </div>
  <section><h2>Reasons</h2><ul>${notes}</ul></section>
  <section><h2>Restatement</h2><p>${escape(receipt.restatement_notice)}</p></section>
  <section><h2>Verify it yourself</h2><p>Download the public receipt and run <code>then verify-public ${escape(receipt.receipt_id)}.public.json</code>. With the private bundle, <code>then verify</code> recomputes the verdict with no network access.</p></section>
  <section><p>${escape(receipt.disclaimer)}</p></section>
</main>
</body>
</html>
`
}

export async function reportCommand(
  target: string,
  flags: { root: string; out?: string },
): Promise<number> {
  const located = locateReceipt(target, flags.root)
  if (!located)
    throw new CliError(`not a receipt id or a path inside a receipt bundle: ${target}`, EXIT.CONFIG)
  const receipt = await new FsReceiptStore(located.root).readPublic(located.receiptId)
  const report = verifyPublic(receipt, { trustedKeys: await trustedKeys() })
  const out = resolve(flags.out ?? `${located.receiptId}.html`)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, reportHtml(receipt, { ok: report.ok, signer: report.signer?.role ?? null }))
  process.stdout.write(`wrote ${out}\n`)
  return report.ok ? EXIT.OK : EXIT.VERIFY_MISMATCH
}
