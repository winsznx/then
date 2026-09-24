import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function ExternalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v6H4V6h6" />
    </Icon>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 8h11v11H8z" />
      <path d="M5 16V5h11" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12 5 5 9-10" />
    </Icon>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h15" />
      <path d="m14 7 5 5-5 5" />
    </Icon>
  )
}

/** Clock-free marker for "not settled": a date line that stops before the cut. */
export function PendingDayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h9" />
      <path d="M16 5v14" strokeDasharray="2 2" />
    </Icon>
  )
}

export function GapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h6M15 12h6" />
      <path d="M12 5v14" />
    </Icon>
  )
}

export function ConflictIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h10l-3-3M20 16H10l3 3" />
    </Icon>
  )
}

export function OffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h18" />
      <path d="M12 5v14" />
      <path d="M5 5l14 14" />
    </Icon>
  )
}
