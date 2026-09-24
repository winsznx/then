'use client'

import { type PublicReceipt } from '@then/core'
import { useEffect, useRef, useState } from 'react'
import { SupportWord, VerdictWord } from '@/components/verdict/verdict'
import { chainName, formatDay } from '@/lib/format'
import { ClaimSentence } from '@/components/verdict/claim-sentence'

const STEPS = [
  {
    title: 'One claim enters.',
    body: 'THEN fixes the token contract, the chain, the UTC day, and what Smart Money is said to have done. Nothing else is read into it.',
  },
  {
    title: "Today's labels.",
    body: 'The dated activity is read through the Smart Money labels wallets carry now. This is the answer a dashboard gives when you scroll back.',
  },
  {
    title: 'The cohort of the day.',
    body: "The same window is rebuilt from Nansen's point-in-time data: the wallets Nansen recognized as Smart Money on that date, and what they did.",
  },
  {
    title: 'One rule decides.',
    body: 'Both sides meet one verdict rule. The result is VALID, CONTAMINATED, or INSUFFICIENT, with a signed receipt anyone can check.',
  },
]

function reveal(visible: boolean): string {
  return `transition-opacity duration-[var(--dur-reconstruct)] ${visible ? 'opacity-100' : 'opacity-100 lg:opacity-0'}`
}

/**
 * The mechanism as a pinned sequence on wide screens: the steps scroll past while the split view
 * beside them fills in. On narrow screens the finished split view sits above the steps.
 */
export function TwoClocks({ receipt }: { receipt: PublicReceipt }) {
  const [step, setStep] = useState(0)
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setStep(Number((entry.target as HTMLElement).dataset.step))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const element of stepRefs.current) if (element) observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const date = formatDay(receipt.claim.as_of_date)

  return (
    <section id="how" aria-labelledby="two-clocks-heading" className="page section-y">
      <h2 id="two-clocks-heading" className="t-h2 max-w-[14ch]">
        One claim. Two clocks.
      </h2>
      <div className="mt-12 grid gap-12 md:mt-16 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7">
          <div className="lg:sticky lg:top-[calc(50vh-190px)]" aria-hidden="true">
            <div className="overflow-hidden rounded-lg border border-rule-strong bg-workspace">
              <div className="border-b border-rule px-5 py-4 md:px-7">
                <p className="font-display text-[22px] leading-tight md:text-[26px]">
                  <ClaimSentence claim={receipt.claim} />
                </p>
                <p className="t-meta mt-1">
                  {chainName(receipt.claim.chain)} · {date} (UTC)
                </p>
              </div>
              <div className="relative grid grid-cols-2">
                <div className={`px-5 py-6 md:px-7 ${reveal(step >= 1)}`}>
                  <p className="t-ui font-medium text-ink">Today&apos;s labels</p>
                  <p className="t-meta mt-4">Support</p>
                  <p className="text-[32px] leading-none md:text-[40px]">
                    <SupportWord state={receipt.comparison.live_label_replay_support} />
                  </p>
                </div>
                <div
                  className={`bg-time-wash px-5 py-6 text-time-deep md:px-7 ${reveal(step >= 2)}`}
                >
                  <p className="t-ui font-medium">As of {date}</p>
                  <p className="t-meta mt-4 !text-current">Support</p>
                  <p className="text-[32px] leading-none md:text-[40px]">
                    <SupportWord state={receipt.comparison.asof_support} />
                  </p>
                </div>
                <div className="absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2 bg-time" />
              </div>
              <div className={`border-t border-rule px-5 py-5 md:px-7 ${reveal(step >= 3)}`}>
                <p className="t-meta">Verdict</p>
                <p className="mt-1 text-[32px] leading-none md:text-[40px]">
                  <VerdictWord verdict={receipt.verdict} />
                </p>
              </div>
            </div>
            <p className="t-meta mt-3">Stored receipt {receipt.receipt_id}, shown as a replay</p>
          </div>
        </div>
        <ol className="lg:col-span-4 lg:col-start-9">
          {STEPS.map((item, index) => (
            <li
              key={item.title}
              ref={(element) => {
                stepRefs.current[index] = element
              }}
              data-step={index}
              className={`border-t border-rule py-8 transition-colors duration-[var(--dur-ui)] lg:flex lg:min-h-[52vh] lg:flex-col lg:justify-center lg:py-0 ${
                step === index ? 'lg:border-ink' : ''
              }`}
            >
              <p className="t-meta">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="t-h3 mt-3">{item.title}</h3>
              <p className="t-ui mt-3 max-w-[40ch] text-ink-soft">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
