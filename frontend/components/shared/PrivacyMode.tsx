'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react'

// "Hide amounts": one eye in the top bar that hides every dollar amount on
// screen, for using Fennec where others can see it. Remembered on this device.
//
// Amounts are formatted in well over a hundred places, so rather than change
// each one, AmountMasker swaps the text of dollar amounts on the page for dots
// and puts it back when turned off. It only edits the text inside existing text
// nodes (never adds or removes nodes), which is safe alongside React: React only
// rewrites a text node when its value changes, and the masker re-masks it then.
// Anything inside [data-amounts="show"] is left alone. Inputs aren't text nodes,
// so forms still show what's being typed.

const STORAGE_KEY = 'fennec-hide-amounts'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}
let hidden = typeof window !== 'undefined' ? read() : false

export function setAmountsHidden(v: boolean) {
  hidden = v
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch { /* private window */ }
  listeners.forEach(l => l())
}

export function useAmountsHidden(): boolean {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => hidden,
    () => false,
  )
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
