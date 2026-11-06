'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import { DEFAULT_SECURITY, readSecurityPrefs, type SecurityPrefs } from '@/lib/security'

// "Hide amounts": one eye in the top bar that hides every dollar amount on
// screen, for using Fennec where others can see it. Whether amounts start
// hidden is a security setting (lib/security.ts, on by default); tapping the
// eye lasts until Fennec is closed.
//
// Amounts are formatted in well over a hundred places, so rather than change
// each one, AmountMasker swaps the text of dollar amounts on the page for dots
// and puts it back when turned off. It only edits the text inside existing text
// nodes (never adds or removes nodes), which is safe alongside React: React only
// rewrites a text node when its value changes, and the masker re-masks it then.
// Anything inside [data-amounts="show"] is left alone. Inputs aren't text nodes,
// so forms still show what's being typed.

const PREFS_KEY = 'fennec-security-prefs'   // this device's copy of the account's settings
const SESSION_KEY = 'fennec-amounts-hidden' // the eye's state until Fennec is closed
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

function readCachedPrefs(): SecurityPrefs {
  try { return readSecurityPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')) } catch { return DEFAULT_SECURITY }
}
function sessionChoice(): boolean | null {
  try { const v = sessionStorage.getItem(SESSION_KEY); return v === null ? null : v === '1' } catch { return null }
}

const inBrowser = typeof window !== 'undefined'
let prefs: SecurityPrefs = inBrowser ? readCachedPrefs() : DEFAULT_SECURITY
let hidden = inBrowser ? sessionChoice() ?? prefs.hideAmountsOnOpen : false

export function setAmountsHidden(v: boolean) {
  hidden = v
  try { sessionStorage.setItem(SESSION_KEY, v ? '1' : '0') } catch { /* private window */ }
  notify()
}

/** The account's security settings, from the profile. Applies "hide amounts on open" if the eye hasn't been used yet. */
export function setSecurityPrefs(p: SecurityPrefs) {
  prefs = p
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* private window */ }
  if (sessionChoice() === null) hidden = p.hideAmountsOnOpen
  notify()
}

export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribe, () => hidden, () => false)
}

export function useSecurityPrefs(): SecurityPrefs {
  return useSyncExternalStore(subscribe, () => prefs, () => DEFAULT_SECURITY)
}

export function PrivacyToggle({ className }: { className?: string }) {
  const on = useAmountsHidden()
  const label = on ? 'Show amounts' : 'Hide amounts'
  return (
    <button onClick={() => setAmountsHidden(!on)} className={className} title={label} aria-label={label} aria-pressed={on}>
      {on ? <IconEyeOff size={20} /> : <IconEye size={20} />}
    </button>
  )
}

// "$1,234.56", "-$12", "NZ$3.4k", "US$ 10", "$1.2M"
const AMOUNT = /(?:NZ|US|AU|A)?\$\s?-?\d[\d,]*(?:\.\d+)?\s?[kKmMbB]?(?![\w])/g
// The number half of "$" + {value} in JSX, which React renders as two text nodes.
const BARE_NUMBER = /^\s*-?\d[\d,]*(?:\.\d+)?\s?[kKmMbB]?\s*$/
const DOTS = '•••••'

function maskText(text: string, prev: Node | null): string {
  if (prev?.nodeType === Node.TEXT_NODE && /\$\s?-?$/.test(prev.nodeValue ?? '') && BARE_NUMBER.test(text)) {
    return text.replace(/\S+(?:\s?[kKmMbB])?/, DOTS)
  }
  return text.replace(AMOUNT, m => m.replace(/-?\d[\d,]*(?:\.\d+)?\s?[kKmMbB]?/, DOTS))
}

const SKIP = 'script, style, textarea, input, [contenteditable="true"], [data-amounts="show"]'

export function AmountMasker() {
  const on = useAmountsHidden()

  useEffect(() => {
    if (!on) return
    // Each masked node: what React last wrote, and the dots shown instead.
    const masked = new Map<Text, { original: string; shown: string }>()

    const visit = (node: Text) => {
      const parent = node.parentElement
      if (!parent || parent.closest(SKIP)) return
      const current = node.nodeValue ?? ''
      const entry = masked.get(node)
      if (entry && current === entry.shown) return
      const shown = maskText(current, node.previousSibling)
      if (shown === current) { masked.delete(node); return }
      masked.set(node, { original: current, shown })
      node.nodeValue = shown
    }
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) { visit(root as Text); return }
      if (root.nodeType !== Node.ELEMENT_NODE) return
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) visit(n as Text)
    }

    walk(document.body)
    const observer = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'characterData') {
          visit(r.target as Text)
          // A changed number may be the second half of "$" + {value}.
          const next = r.target.nextSibling
          if (next?.nodeType === Node.TEXT_NODE) visit(next as Text)
        } else r.addedNodes.forEach(walk)
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })

    return () => {
      observer.disconnect()
      masked.forEach((e, node) => { if (node.isConnected && node.nodeValue === e.shown) node.nodeValue = e.original })
    }
  }, [on])

  return null
}
