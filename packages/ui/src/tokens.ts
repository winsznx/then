/**
 * The same tokens as tokens.css, for surfaces that cannot read CSS variables (OG images, the
 * standalone HTML report). Keep in lockstep with tokens.css.
 */
export const color = {
  paper0: '#F7F4ED',
  paper1: '#FCFBF7',
  paper2: '#EEE9DE',
  ink0: '#121210',
  ink1: '#3A3934',
  ink2: '#6E6B63',
  line0: '#D9D3C8',
  lineStrong: '#AAA398',
  timeBlue: '#2F5EFF',
  timeBlueDeep: '#2143C7',
  timeBlueWash: '#E9EEFF',
  valid: '#0E7256',
  validWash: '#E9F5F0',
  contaminated: '#A54411',
  contaminatedWash: '#FFF0E5',
  insufficient: '#6B675F',
  insufficientWash: '#EFEBE4',
  nansen: '#19C99A',
  white: '#FFFFFF',
} as const

export type VerdictName = 'VALID' | 'CONTAMINATED' | 'INSUFFICIENT'

export const verdictColor: Record<VerdictName, { ink: string; wash: string }> = {
  VALID: { ink: color.valid, wash: color.validWash },
  CONTAMINATED: { ink: color.contaminated, wash: color.contaminatedWash },
  INSUFFICIENT: { ink: color.insufficient, wash: color.insufficientWash },
}
