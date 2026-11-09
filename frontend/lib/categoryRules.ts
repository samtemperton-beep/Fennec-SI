// The keyword suggested when you turn a category choice into a rule. A rule
// matches any transaction whose description *contains* the keyword, so the
// suggestion must be an exact piece of the description, and short enough to
// catch the same merchant at another branch or on another day.
//
// Before this, the suggestion stripped punctuation and took the first three
// words, so "POS W/D PAK N SAVE BAYFAIR" became "pos save bayfair": a phrase
// that appears in no transaction, so the rule matched nothing else.
// Mirrors merchantKey in backend/src/services/sharedCategories.ts.

import { looksLikeInterest, looksLikeRwt } from '@/lib/savings'

const PREFIX = /^((pos|eftpos|visa|debit|card|purchase|w\/d|dd|ap|tfr|ft)\s+)+/

export function suggestKeyword(description: string): string {
  const text = description.toLowerCase().replace(/\s+/g, ' ').trim()
  // Interest and tax lines: the wording, not the first word ("credit").
  if (looksLikeRwt(text)) {
    const m = text.match(/withholding tax|\brwt\b|w\/h tax|wht/)
    if (m) return m[0]
  }
  if (looksLikeInterest(text)) {
    const m = text.match(/credit interest|interest credit|interest paid|\binterest\b/)
    if (m) return m[0]
  }
  const rest = text.replace(PREFIX, '')
  const name = rest.match(/^[a-z][a-z&'.-]*(?: [a-z&'.-]+)*/)?.[0] ?? ''
  const words = name.split(' ').filter(Boolean)
  const picked: string[] = []
  for (const w of words) {
    picked.push(w)
    const next = words[picked.length]
    // Stop once the first word is long enough, unless a single letter follows (as in "pak n save").
    if (picked.join('').length >= 3 && w.length >= 3 && !(next && next.length === 1)) break
  }
  const key = picked.join(' ')
  if (key.length >= 3 && text.includes(key)) return key
  // No word-like merchant name: the first couple of words, as they appear.
  return rest.split(' ').slice(0, 2).join(' ')
}

