import type { ChallengeStats } from '@then/challenge'
import { VERDICTS } from '@then/core'

function ratio(correct: number, played: number): string {
  return played === 0 ? 'none yet' : `${correct} of ${played}`
}

/**
 * The player's record as a ledger: a notch per day of the current streak, then plain counts.
 * Nothing here ranks players or implies trading skill.
 */
export function StatsLedger({ stats }: { stats: ChallengeStats }) {
  const notches = Math.min(stats.current_streak, 30)
  const rows: [string, string][] = [
    ['Daily played', String(stats.daily_played)],
    ['Daily correct', String(stats.daily_correct)],
    ['Current streak', `${stats.current_streak} day${stats.current_streak === 1 ? '' : 's'}`],
    ['Best streak', `${stats.best_streak} day${stats.best_streak === 1 ? '' : 's'}`],
    ['Archive', ratio(stats.archive_correct, stats.archive_played)],
    ...VERDICTS.map((verdict): [string, string] => [
      `${verdict.charAt(0)}${verdict.slice(1).toLowerCase()} cases`,
      ratio(stats.by_verdict[verdict].correct, stats.by_verdict[verdict].played),
    ]),
  ]
  return (
    <section aria-label="Your record" className="mt-14 border-t border-rule pt-8">
      <h2 className="t-ui font-medium text-ink">Your record</h2>
      <div aria-hidden="true" className="relative mt-5 h-6 max-w-[560px]">
        <div className="absolute top-1/2 right-0 left-0 h-px bg-rule-strong" />
        {Array.from({ length: notches }, (_, index) => (
          <span
            key={index}
            className={`absolute top-1 h-4 w-[2px] bg-ink ${index === notches - 1 ? 'animate-resolve' : ''}`}
            style={{ left: `${(index / 30) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt className="t-meta">{term}</dt>
            <dd className="t-ui mt-0.5 text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="t-ui mt-6 max-w-[62ch] text-meta">
        Scores come from comparing your answer with the frozen receipt. They say nothing about
        trading skill.
      </p>
    </section>
  )
}
