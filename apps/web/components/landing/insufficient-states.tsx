import { ConflictIcon, GapIcon, OffIcon, PendingDayIcon } from '@/components/icons'
import { VerdictWord } from '@/components/verdict/verdict'

const STATES = [
  {
    icon: PendingDayIcon,
    title: 'The day has not settled',
    body: 'Today has no end-of-day snapshot yet, so there is nothing fixed to compare against.',
  },
  {
    icon: GapIcon,
    title: 'The historical snapshot is missing',
    body: 'Nansen returned no point-in-time record for the date. THEN does not borrow a neighboring day.',
  },
  {
    icon: ConflictIcon,
    title: 'The sources disagree',
    body: 'Point-in-time sources point in opposite directions above the threshold.',
  },
  {
    icon: OffIcon,
    title: 'Point-in-time data is off',
    body: "Without Nansen's historical surface, today's labels alone can never produce VALID or CONTAMINATED.",
  },
]

export function InsufficientStates() {
  return (
    <section aria-labelledby="unknown-heading" className="page section-y">
      <h2 id="unknown-heading" className="t-h2 max-w-[16ch]">
        Designed to say &ldquo;I don&apos;t know.&rdquo;
      </h2>
      <ul className="mt-12 md:mt-16">
        {STATES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="grid gap-3 py-6 md:grid-cols-12 md:items-center md:gap-6">
            <div className="flex items-center gap-4 md:col-span-5">
              <Icon size={24} className="shrink-0 text-ink" />
              <p className="t-ui text-[16px] font-medium text-ink">{title}</p>
            </div>
            <p className="t-ui text-ink-soft md:col-span-5">{body}</p>
            <p className="md:col-span-2 md:text-right">
              <VerdictWord verdict="INSUFFICIENT" className="text-[14px]" />
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
