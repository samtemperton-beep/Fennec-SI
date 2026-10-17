// Dashboard card layout: which cards show, and in what order. Saved per user in
// profiles.dashboard_layout as [{ id, hidden }].

export type CardId = 'summary' | 'networth' | 'insights' | 'cashflow' | 'goals' | 'quicklinks'
export interface LayoutItem { id: CardId; hidden: boolean }

export const CARD_INFO: Record<CardId, { label: string; description: string; half?: boolean }> = {
  summary:    { label: "Fennec's daily briefing", description: 'A short AI-written summary of how things are going' },
  networth:   { label: 'Net worth',               description: 'Total, trend chart and what it is made of' },
  insights:   { label: 'How things are tracking', description: 'Notifications from every part of the app' },
  cashflow:   { label: 'Cash flow',               description: 'Money in, money out and what is left this month', half: true },
  goals:      { label: 'Savings goals',           description: 'Progress on your top three goals', half: true },
  quicklinks: { label: 'Quick access',            description: 'Shortcuts to the pages you use most' },
}

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'summary', hidden: false },
  { id: 'networth', hidden: false },
  { id: 'insights', hidden: false },
  { id: 'cashflow', hidden: false },
  { id: 'goals', hidden: false },
  { id: 'quicklinks', hidden: false },
]

/** Keeps a saved layout valid: drops unknown cards, appends any added since it was saved. */
export function normaliseLayout(saved: unknown): LayoutItem[] {
  if (!Array.isArray(saved)) return DEFAULT_LAYOUT
  const known = new Set(Object.keys(CARD_INFO))
  const seen = new Set<string>()
  const out: LayoutItem[] = []
  for (const item of saved) {
    if (item && typeof item.id === 'string' && known.has(item.id) && !seen.has(item.id)) {
      seen.add(item.id)
      out.push({ id: item.id as CardId, hidden: !!item.hidden })
    }
  }
  for (const d of DEFAULT_LAYOUT) if (!seen.has(d.id)) out.push(d)
  return out
}
