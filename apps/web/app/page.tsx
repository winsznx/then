import { METHOD_VERSION } from '@then/core'
import { EvidenceSummary } from '@/components/landing/evidence-summary'
import { Faq } from '@/components/landing/faq'
import { FinalCta } from '@/components/landing/final-cta'
import { Hero } from '@/components/landing/hero'
import { InsufficientStates } from '@/components/landing/insufficient-states'
import { LabelMoved } from '@/components/landing/label-moved'
import { LandingBeacon } from '@/components/landing/landing-beacon'
import { LimitsList } from '@/components/landing/limits-list'
import { Outcomes } from '@/components/landing/outcomes'
import { ReceiptObject } from '@/components/landing/receipt-object'
import { TwoClocks } from '@/components/landing/two-clocks'
import { loadCorpusView, type CorpusView } from '@/lib/server/corpus'
import { log } from '@/lib/server/nansen'
import { exampleReceipt } from '@/lib/server/receipts'
import { connection } from 'next/server'

async function corpusOrNull(): Promise<CorpusView | null> {
  try {
    return await loadCorpusView()
  } catch (error) {
    log('error', {
      event: 'landing.corpus_failed',
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export default async function Home() {
  await connection()
  const [receipt, corpus] = await Promise.all([exampleReceipt(), corpusOrNull()])
  const run = corpus?.runs[0] ?? null
  return (
    <>
      <LandingBeacon />
      <Hero receipt={receipt} />
      <LabelMoved />
      {receipt ? <TwoClocks receipt={receipt} /> : null}
      <Outcomes />
      {receipt ? <ReceiptObject receipt={receipt} /> : null}
      <EvidenceSummary
        run={run}
        heldOutRun={Boolean(corpus?.runs.some((entry) => entry.method_version === METHOD_VERSION))}
      />
      <InsufficientStates />
      <LimitsList />
      <Faq />
      <FinalCta />
    </>
  )
}
