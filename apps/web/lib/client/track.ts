export type ProductEvent =
  | 'landing_view'
  | 'inspect_opened'
  | 'example_loaded'
  | 'claim_submitted'
  | 'stamp_started'
  | 'provenance_opened'
  | 'receipt_opened'
  | 'receipt_shared'
  | 'receipt_downloaded'
  | 'public_verify_run'
  | 'corpus_opened'
  | 'method_opened'
  | 'challenge_started'
  | 'challenge_selected'
  | 'challenge_replayed'
  | 'challenge_share_clicked'
  | 'archive_opened'
  | 'trade_prepare_attempted'

export type EventProps = Partial<
  Record<
    | 'chain'
    | 'claim_type'
    | 'verdict'
    | 'mode'
    | 'surface'
    | 'latency_bucket'
    | 'method_version'
    | 'decision_ms',
    string | number | boolean
  >
>

/**
 * First-party product analytics. A beacon to this app's own route: no third-party script, no
 * cookies beyond the anonymous session, and the server drops any name or key it does not expect.
 */
export function track(name: ProductEvent, props: EventProps = {}): void {
  const body = JSON.stringify({ name, props })
  if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) return
  fetch('/api/events', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
    keepalive: true,
  }).catch((error: unknown) => console.warn('analytics event dropped', name, error))
}
