import { VERDICTS, type Verdict } from '@then/core'
import { VerdictWord } from '@/components/verdict/verdict'

const HOVER_WASH: Record<Verdict, string> = {
  VALID: 'hover:bg-valid-wash',
  CONTAMINATED: 'hover:bg-contaminated-wash',
  INSUFFICIENT: 'hover:bg-insufficient-wash',
}

const OUTCOME_TEXT: Record<Verdict, string> = {
  VALID: 'The historical cohort supports the claim.',
  CONTAMINATED: "Today's labels create support that was not present at the cutoff.",
  INSUFFICIENT: 'Historical evidence is too thin or unavailable to decide.',
}

export function Outcomes() {
  return (
    <section aria-labelledby="outcomes-heading" className="page section-y">
      <h2 id="outcomes-heading" className="t-h2 max-w-[16ch]">
        Three outcomes. No alpha score.
      </h2>
      <ul className="mt-12 border-t border-rule-strong md:mt-16">
        {VERDICTS.map((verdict) => (
          <li
            key={verdict}
            className={`grid gap-3 border-b border-rule-strong px-2 py-8 transition-colors duration-[var(--dur-ui)] md:grid-cols-12 md:items-baseline md:gap-6 md:py-10 ${HOVER_WASH[verdict]}`}
          >
            <p className="text-[36px] leading-none md:col-span-6 md:text-[64px] xl:text-[80px]">
              <VerdictWord verdict={verdict} />
            </p>
            <p className="t-lead md:col-span-5 md:col-start-8">{OUTCOME_TEXT[verdict]}</p>
          </li>
        ))}
      </ul>
      <p className="t-ui mt-6 max-w-[62ch] text-ink-soft">
        There is no confidence percentage and no fourth badge. A stamp is one of three words, the
        reason in plain English, and a receipt.
      </p>
    </section>
  )
}
