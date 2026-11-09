// Goal ideas for someone starting out, from what they're working towards, their
// age range and their spending. Pure, so it can be tested. The figures are
// round starting points that people adjust before adding the goal.

import type { AboutYou, InterestId } from '@/lib/aboutYou'
import { GOVT_MTC_FULL_AT } from '@/lib/kiwisaver'

export interface GoalIdea {
  key: string
  name: string
  target: number
  months: number
  monthly: number
  why: string
}

export interface GoalIdeaInput {
  about: AboutYou
  /** Average monthly spending, if Fennec has it. */
  monthlySpend: number | null
  /** What's owed on credit cards (positive), if any. */
  cardDebt: number
  /** Names of goals already set, so ideas aren't repeated. */
  existing: string[]
  now?: Date
}

const round = (n: number, to: number) => Math.max(to, Math.round(n / to) * to)
const perMonth = (target: number, months: number) => Math.ceil(target / Math.max(1, months) / 10) * 10

/** Months until the KiwiSaver year ends (30 June), at least 1. */
function monthsToJune(now: Date) {
  const end = new Date(now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear(), 5, 30)
  return Math.max(1, Math.round((end.getTime() - now.getTime()) / (30.44 * 86_400_000)))
}

export function goalIdeas(i: GoalIdeaInput, max = 5): GoalIdea[] {
  const now = i.now ?? new Date()
  const want = new Set<InterestId>(i.about.interests ?? [])
  const band = i.about.ageBand
  const has = (re: RegExp) => i.existing.some(n => re.test(n.toLowerCase()))
  const ideas: (GoalIdea & { rank: number })[] = []
  const add = (rank: number, key: string, name: string, target: number, months: number, why: string) =>
    ideas.push({ rank, key, name, target, months, monthly: perMonth(target, months), why })

  if (!has(/emergency|rainy|buffer/)) {
    if (i.monthlySpend && i.monthlySpend > 0) {
      add(want.has('emergency') ? 0 : 1, 'emergency', 'Emergency fund', round(i.monthlySpend * 3, 500), 12,
        `Three months of your spending (about ${Math.round(i.monthlySpend).toLocaleString('en-NZ')} a month), for job loss or a big bill. Keep it in savings you can reach.`)
    } else {
      add(want.has('emergency') ? 0 : 1, 'emergency', 'Starter emergency fund', 2000, 6,
        'A first buffer for surprise bills, before building up to three months of spending.')
    }
  }
  if ((want.has('debt') || i.cardDebt > 0) && !has(/debt|credit card/)) {
    const target = i.cardDebt > 0 ? round(i.cardDebt, 50) : 3000
    add(i.cardDebt > 0 ? 0 : 2, 'debt', 'Clear my credit card', target, 6,
      i.cardDebt > 0 ? 'Credit card interest is often 20% or more, so clearing it usually beats any savings rate.' : 'Paying off high-interest debt first usually saves more than saving at the same time.')
  }
  if ((want.has('home') || band === 'Under 25' || band === '25–34') && !has(/home|house|deposit/)) {
    add(want.has('home') ? 2 : 6, 'home', 'First home deposit', 80000, 48,
      'A 10% deposit on an $800,000 home. KiwiSaver can usually go towards a first home too, so count that in.')
  }
  if ((want.has('retirement') || band === '45–54' || band === '55–64') && !has(/kiwisaver|retire/)) {
    const months = monthsToJune(now)
    add(want.has('retirement') ? 2 : 5, 'kiwisaver', 'KiwiSaver: get the full government contribution', Math.ceil(GOVT_MTC_FULL_AT), months,
      `Putting in at least $${GOVT_MTC_FULL_AT.toLocaleString('en-NZ')} by 30 June gets you the full government contribution. Your pay deductions count towards it.`)
  }
  if (want.has('investing') && !has(/invest|shares|etf/)) {
    add(3, 'investing', 'Start investing', 1000, 4, 'A first amount to invest in a diversified fund or ETF, once your emergency fund is under way.')
  }
  if (want.has('holiday') && !has(/holiday|travel|trip/)) add(3, 'holiday', 'Holiday', 4000, 12, 'Saving ahead means the trip is paid for before you go.')
  if (want.has('car') && !has(/car|vehicle/)) add(4, 'car', 'Car', 12000, 24, 'Buying with cash avoids car-loan interest, which is often 10% or more.')
  if (want.has('business') && !has(/tax|business/)) add(3, 'business', 'Tax set-aside', 5000, 6, 'Money put aside as you earn, so the tax bill isn’t a shock.')

  return ideas.sort((a, b) => a.rank - b.rank).slice(0, max).map(({ rank, ...g }) => g)
}
