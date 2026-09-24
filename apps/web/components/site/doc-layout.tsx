export interface DocSection {
  id: string
  title: string
}

/**
 * Reading pages: a title block, then a contents rail beside one reading column. Section ids are
 * the page's anchors, so links such as /method#verdicts land on the right heading.
 */
export function DocLayout({
  title,
  lead,
  meta,
  sections,
  children,
}: {
  title: string
  lead: React.ReactNode
  meta?: React.ReactNode
  sections: DocSection[]
  children: React.ReactNode
}) {
  return (
    <div className="page pt-10 pb-24 md:pt-16 md:pb-32">
      <header className="max-w-[900px]">
        <h1 className="t-h2">{title}</h1>
        <div className="t-lead mt-5 max-w-[62ch]">{lead}</div>
        {meta ? <div className="t-meta mt-5">{meta}</div> : null}
      </header>
      <div className="mt-12 grid gap-10 md:mt-16 lg:grid-cols-12 lg:gap-6">
        <nav aria-label="On this page" className="lg:col-span-3">
          <ul className="t-ui space-y-2 border-l border-rule pl-4 lg:sticky lg:top-[calc(var(--header-h-condensed)+24px)]">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-ink-soft hover:text-ink">
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="doc max-w-[var(--reading-max)] min-w-0 lg:col-span-8 lg:col-start-5">
          {children}
        </div>
      </div>
    </div>
  )
}
