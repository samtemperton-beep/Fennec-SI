// Finance → Insurance (insurance_migration.sql). Policies are read from a
// schedule (backend/src/services/policyReader.ts) or typed in, then checked
// here. Everything is general information, not advice.

export type Kind = 'home' | 'landlord' | 'contents' | 'car' | 'life' | 'health' | 'income' | 'travel' | 'pet' | 'other'
export type Holder = 'me' | 'partner' | 'joint'
export type Frequency = 'annual' | 'quarterly' | 'monthly' | 'fortnightly' | 'weekly'

export interface PolicyDetails {
  cover_level?: string | null; suburb?: string | null; settlement?: string | null; occupancy?: string | null
  property_type?: string | null; year_built?: number | null; floor_area?: number | null; outbuildings_area?: number | null
  walls?: string | null; roof?: string | null; storeys?: number | null; dwellings_in_building?: number | null; dwellings_insured?: number | null
  nh_cover?: number | null; business_use?: boolean | null
  other_excesses?: { name: string; amount: number }[]; optional_added?: string[]; optional_available?: string[]
  interested_parties?: string[]; cooling_off_days?: number | null
  /** A rebuild estimate the person got (Cordell Sum Sure, a valuer), to check the sum insured against. */
  rebuild_estimate?: RebuildEstimate | null
}

export interface RebuildEstimate { today: number; in12: number | null; source: string; date: string }

/** Cordell Sum Sure, free and run by Cotality; the same engine most NZ insurers use. */
export const CORDELL_URL = 'https://sumsure.cotality.com/#/products/8/profiles/219'

export interface Policy {
  id: string
  kind: Kind
  holder: Holder
  insurer: string
  label: string | null
  rental_property_id: string | null
  lives_there: boolean | null
  premium_total: number | null
  base_premium: number | null
  levies: number | null
  gst: number | null
  pay_frequency: Frequency | null
  instalment: number | null
  start_date: string | null
  renewal_date: string | null
  sum_insured: number | null
  excess: number | null
  details: PolicyDetails
}

export type PolicyDraft = Omit<Policy, 'id'>

export const KIND_LABEL: Record<Kind, string> = {
  home: 'Home', landlord: 'Landlord', contents: 'Contents', car: 'Car', life: 'Life', health: 'Health',
  income: 'Income protection', travel: 'Travel', pet: 'Pet', other: 'Other',
}
export const PROPERTY_KINDS: Kind[] = ['home', 'landlord', 'contents']

/** Insurers that are the same company underneath, so a quote from one isn't a real comparison. */
const GROUPS: { group: string; brands: string[] }[] = [
  { group: 'IAG', brands: ['ami', 'state', 'nzi', 'lumley'] },
  { group: 'Suncorp', brands: ['vero', 'aa insurance', 'asteron'] },
]
export function groupOf(insurer: string) {
  const i = insurer.toLowerCase()
  return GROUPS.find(g => g.brands.some(b => i === b || i.startsWith(b + ' ') || i.includes(b + ' insurance') || (b.length > 3 && i.includes(b)))) ?? null
}
const OTHERS: Record<string, string[]> = {
  landlord: ['Tower', 'AA Insurance', 'Youi', 'Initio (landlord specialist)', 'AMI', 'State', 'an insurance broker'],
  home: ['Tower', 'AA Insurance', 'Youi', 'AMI', 'State', 'Cove', 'an insurance broker'],
  contents: ['Tower', 'AA Insurance', 'Youi', 'AMI', 'State', 'Cove'],
  car: ['Tower', 'AA Insurance', 'Youi', 'AMI', 'State', 'Cove'],
}
/** Insurers worth a quote: other companies, not other brands of the same one. */
export function compareWith(p: Pick<Policy, 'insurer' | 'kind'>) {
  const g = groupOf(p.insurer)
  return (OTHERS[p.kind] ?? []).filter(o => {
    if (o.toLowerCase().startsWith(p.insurer.toLowerCase())) return false
    const og = groupOf(o)
    return !(g && og && og.group === g.group)
  })
}

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
export const money = (n: number | null | undefined) => (n == null ? '–' : nzd.format(n))
export const fmtDate = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date())
export const daysUntil = (d: string, from = today()) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

export interface Finding { level: 'problem' | 'warn' | 'saving' | 'info' | 'ok'; title: string; detail: string }

/**
 * Fennec's check of one policy. `paidLast12` is what left the person's accounts
 * to this insurer in the 12 months before the policy started; `rentalName` the
 * linked rental property; `others` their other policies (and their partner's).
 */
export function checkPolicy(p: Policy, ctx: { paidLast12?: number | null; rentalName?: string | null; others: Policy[]; now?: string }): Finding[] {
  const out: Finding[] = []
  const d = p.details ?? {}
  const property = PROPERTY_KINDS.includes(p.kind)
  const occ = (d.occupancy ?? '').toLowerCase()
  const saysLives = /\bi live\b|\bwe live\b|owner.?occupied|live in the home/.test(occ)

  // 1. Who lives there: the answer the policy is based on.
  if (property && p.lives_there === false && saysLives) {
    out.push({ level: 'problem', title: 'The policy says you live there, but you don\'t',
      detail: `It's based on "${d.occupancy}". Insurers can decline a claim or cancel when information is wrong, so tell ${p.insurer} who lives there now${p.kind === 'home' ? ' and ask about landlord cover' : ''}.` })
  } else if (property && p.lives_there === true && p.rental_property_id) {
    out.push({ level: 'info', title: 'You live there and also rent part of it',
      detail: 'Rent from flatmates or boarders in your own home is taxed differently from a whole rental: costs are shared between you and the tenants, or IRD\'s standard-cost method for boarders is used. Check with your accountant before using the Rental tax summary as is.' })
  }
  if (p.kind === 'home' && (p.rental_property_id || p.lives_there === false)) {
    out.push({ level: 'warn', title: 'A home policy on a rental',
      detail: 'Landlord policies usually add cover a home policy doesn\'t: loss of rent, damage by tenants (careless, intentional or malicious) and methamphetamine contamination, plus liability as a landlord. Ask for a landlord quote.' })
  }
  if (property && p.lives_there === null) {
    out.push({ level: 'info', title: 'Do you live at this property?', detail: 'Answer it in Edit so Fennec can check the policy matches.' })
  }

  // 2. Sum insured against a rebuild estimate the person got, or else floor area (a rough guide).
  const est = d.rebuild_estimate
  const building = p.kind === 'home' || p.kind === 'landlord'
  if (building && p.sum_insured && est?.today) {
    const target = est.in12 ?? est.today
    const from = `${est.source} (${fmtDate(est.date)})`
    const old = daysUntil(est.date, ctx.now) < -365 * 3
    if (p.sum_insured < est.today) {
      out.push({ level: 'problem', title: `Below your rebuild estimate by ${money(est.today - p.sum_insured)}`,
        detail: `${from} puts the rebuild at ${money(est.today)} today${est.in12 ? ` and ${money(est.in12)} in a year` : ''}, but the sum insured is ${money(p.sum_insured)}. After a total loss you'd pay the gap, and some insurers only give their full replacement benefit when the sum insured is at least their estimate. Ask to raise it.` })
    } else if (p.sum_insured < target) {
      out.push({ level: 'warn', title: 'Close to your rebuild estimate',
        detail: `It covers today's estimate (${money(est.today)}) but not the ${money(target)} ${est.source} expects in 12 months, when building costs are higher. Consider matching that.` })
    } else if (p.sum_insured > target * 1.1) {
      out.push({ level: 'saving', title: `About ${money(p.sum_insured - target)} above your rebuild estimate`,
        detail: `${from}: ${money(est.today)} today${est.in12 ? `, ${money(est.in12)} in 12 months` : ''}. The sum insured is ${money(p.sum_insured)}, and the premium is priced on it. Ask ${p.insurer} for their own estimate and to set the sum insured at it (or at the 12-month figure, to allow for rising costs).` })
    } else {
      out.push({ level: 'ok', title: 'Sum insured matches your rebuild estimate', detail: `${from}: ${money(est.today)} today${est.in12 ? `, ${money(est.in12)} in 12 months` : ''}.` })
    }
    if (old) out.push({ level: 'info', title: 'Your rebuild estimate is over 3 years old', detail: 'Building costs change; run it again.' })
  }
  const area = d.floor_area ?? null
  if (building && p.sum_insured && area && !est?.today) {
    const perM2 = p.sum_insured / area
    const withOut = d.outbuildings_area ? p.sum_insured / (area + d.outbuildings_area) : null
    const range = `${nzd.format(perM2)} per m² of the ${area} m² home${withOut ? ` (${nzd.format(withOut)} including the ${d.outbuildings_area} m² of outbuildings)` : ''}`
    if (perM2 > 6000) out.push({ level: 'saving', title: 'The sum insured looks high', detail: `${money(p.sum_insured)} is ${range}. The premium is priced on it. Get a proper rebuild estimate (the Rebuild estimate box below links to the free Cordell Sum Sure calculator) and keep the sum insured at or above it, so replacement cover still applies.` })
    else if (perM2 < 2800) out.push({ level: 'warn', title: 'The sum insured may be low', detail: `${money(p.sum_insured)} is ${range}. If it costs more than that to rebuild, you'd pay the gap. Check it with the insurer's rebuild calculator.` })
    else out.push({ level: 'ok', title: 'Sum insured looks in a normal range', detail: `${range}. Still worth checking with the insurer's rebuild calculator now and then.` })
  }
  if ((d.dwellings_in_building ?? 0) > (d.dwellings_insured ?? 0) && (d.dwellings_insured ?? 0) > 0) {
    out.push({ level: 'info', title: `It insures ${d.dwellings_insured} of the ${d.dwellings_in_building} homes in the building`,
      detail: 'For a shared wall or roof, check how the neighbour\'s insurance and any cross-lease or unit title rules fit with yours.' })
  }

  // 3. What can actually be shopped around.
  if (p.premium_total && p.levies) {
    const shoppable = p.premium_total - p.levies - (p.gst && p.base_premium ? p.gst - p.base_premium * 0.15 : 0)
    out.push({ level: 'info', title: `About ${money(shoppable)} of the ${money(p.premium_total)} is the insurer's own price`,
      detail: `${money(p.levies)} is government levies (Natural Hazards and Fire and Emergency), which are the same at every insurer. Quotes only differ on the rest.` })
  }

  // 4. Against what was paid last year.
  if (p.premium_total && ctx.paidLast12 && ctx.paidLast12 > 50) {
    const change = (p.premium_total - ctx.paidLast12) / ctx.paidLast12 * 100
    out.push({ level: change > 10 ? 'warn' : 'info', title: `${change >= 0 ? 'Up' : 'Down'} about ${Math.abs(Math.round(change))}% on what you paid ${p.insurer} last year`,
      detail: `${money(ctx.paidLast12)} went to ${p.insurer} from your accounts in the year before this policy started; this one is ${money(p.premium_total)}.${change > 10 ? ' A good reason to get other quotes.' : ''} (If you have other policies with them, last year's figure includes those.)` })
  }

  // 5. Ways to pay less.
  const levers: string[] = []
  if (p.excess != null && p.excess < 1000) levers.push(`a higher excess than ${money(p.excess)} (say $1,000 to $2,000)`)
  if (d.optional_added?.length) levers.push(`dropping add-ons you wouldn't claim on (${d.optional_added.join(', ')})`)
  if (p.pay_frequency && p.pay_frequency !== 'annual') levers.push(`whether paying once a year costs less than paying ${p.pay_frequency}`)
  const sameInsurer = ctx.others.filter(o => o.id !== p.id && o.insurer.toLowerCase() === p.insurer.toLowerCase())
  levers.push(sameInsurer.length ? `the multi-policy discount for your ${sameInsurer.map(o => `${KIND_LABEL[o.kind].toLowerCase()}${o.holder === 'partner' ? ' (partner\'s)' : ''}`).join(' and ')} policy with them` : 'a multi-policy discount if you move other policies (or your partner\'s) to the same insurer')
  out.push({ level: 'saving', title: 'Ways to bring the price down', detail: `Ask about ${levers.join('; ')}.` })

  // 6. Bundling across the household.
  const elsewhere = ctx.others.filter(o => o.id !== p.id && o.insurer.toLowerCase() !== p.insurer.toLowerCase())
  if (elsewhere.length) {
    const byInsurer = [...new Set(elsewhere.map(o => o.insurer))]
    out.push({ level: 'saving', title: `Your household's policies are with ${byInsurer.length + 1} insurers`,
      detail: `Others are with ${byInsurer.join(', ')}. Insurers usually discount several policies held together, and some count a partner at the same address. Get a bundled quote from ${byInsurer[0]} for this one too, and compare.` })
  }

  // 7. Shopping around, and switching safely.
  const g = groupOf(p.insurer)
  // A home policy on a rental is compared with landlord policies.
  const others = compareWith({ insurer: p.insurer, kind: p.kind === 'home' && (p.rental_property_id || p.lives_there === false) ? 'landlord' : p.kind })
  if (others.length) {
    out.push({ level: 'info', title: 'Where to get comparison quotes',
      detail: `${g ? `${p.insurer} is part of ${g.group}${g.group === 'IAG' ? ' with State and NZI' : ''}, so a quote from those isn't a real comparison. ` : ''}Try ${others.slice(0, 5).join(', ')}. Give every insurer the same, correct answers.` })
  }
  const startsIn = p.start_date ? daysUntil(p.start_date, ctx.now) : null
  if (startsIn !== null && startsIn > 0 && startsIn <= 60) {
    out.push({ level: 'warn', title: `This policy starts in ${startsIn} day${startsIn === 1 ? '' : 's'} (${fmtDate(p.start_date)})`,
      detail: `There's still time to correct it, change the cover or get other quotes before it begins.${d.cooling_off_days ? ` After it starts you also have ${d.cooling_off_days} days to cancel for a refund if you haven't claimed.` : ''} Don't let any cover lapse while you switch.` })
  }
  if (p.renewal_date && !(startsIn !== null && startsIn > 0)) {
    const days = daysUntil(p.renewal_date, ctx.now)
    const parties = d.interested_parties?.length ? ` ${d.interested_parties.join(' and ')} ${d.interested_parties.length > 1 ? 'are' : 'is'} named on it, so a new insurer must note ${d.interested_parties.length > 1 ? 'them' : 'it'} and you send the bank the new certificate.` : ''
    if (days >= 0 && days <= 60) out.push({ level: 'warn', title: `Renews in ${days} day${days === 1 ? '' : 's'} (${fmtDate(p.renewal_date)})`,
      detail: `Now's the time for quotes. Don't cancel until the new cover has started.${parties}${d.cooling_off_days ? ` You also have ${d.cooling_off_days} days after renewal to cancel for a refund if you haven't claimed.` : ''}` })
    else if (parties) out.push({ level: 'info', title: 'If you switch', detail: parties.trim() })
  }
  return out
}

/** Plain text for the fox chat and for drafting a message to the insurer. */
export function policyText(p: Policy, findings: Finding[], rentalName?: string | null) {
  const d = p.details ?? {}
  const lines = [
    `${p.insurer} ${KIND_LABEL[p.kind].toLowerCase()} insurance${p.label ? ` for ${p.label}` : ''}${p.holder !== 'me' ? ` (${p.holder === 'partner' ? "partner's" : 'joint'})` : ''}${rentalName ? `, linked to the rental ${rentalName}` : ''}.`,
    `Cover: ${d.cover_level ?? '?'}; ${d.settlement ?? '?'} settlement; sum insured ${money(p.sum_insured)}; excess ${money(p.excess)}${d.other_excesses?.length ? ` (also ${d.other_excesses.map(e => `${e.name} ${money(e.amount)}`).join(', ')})` : ''}.`,
    `Premium ${money(p.premium_total)} a year (insurer's premium ${money(p.base_premium)}, levies ${money(p.levies)}, GST ${money(p.gst)}), paid ${p.pay_frequency ?? '?'}${p.instalment ? ` at ${money(p.instalment)}` : ''}. Period ${fmtDate(p.start_date)} to ${fmtDate(p.renewal_date)}.`,
    d.occupancy ? `The policy says: "${d.occupancy}". Does the person actually live there: ${p.lives_there === null ? 'not answered' : p.lives_there ? 'yes' : 'no'}.` : '',
    d.floor_area ? `Property: ${d.property_type ?? ''}, built ${d.year_built ?? '?'}, ${d.floor_area} m² plus ${d.outbuildings_area ?? 0} m² outbuildings, ${d.walls ?? '?'} walls, ${d.roof ?? '?'} roof, ${d.storeys ?? '?'} storey(s); insures ${d.dwellings_insured ?? '?'} of ${d.dwellings_in_building ?? '?'} dwellings.` : '',
    d.rebuild_estimate?.today ? `Rebuild estimate (${d.rebuild_estimate.source}, ${fmtDate(d.rebuild_estimate.date)}): ${money(d.rebuild_estimate.today)} today${d.rebuild_estimate.in12 ? `, ${money(d.rebuild_estimate.in12)} in 12 months` : ''}.` : '',
    d.optional_added?.length ? `Optional benefits included: ${d.optional_added.join(', ')}.` : '',
    d.interested_parties?.length ? `Interested parties: ${d.interested_parties.join(', ')}.` : '',
    'Fennec\'s check:',
    ...findings.map(f => `- [${f.level}] ${f.title}. ${f.detail}`),
  ]
  return lines.filter(Boolean).join('\n')
}
