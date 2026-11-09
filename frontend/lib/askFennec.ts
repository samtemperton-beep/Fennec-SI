// Opens the fox and asks it a question, from anywhere on the page.
// components/shared/FennecAI.tsx listens for this event.
export const ASK_FENNEC_EVENT = 'fennec:ask'

export function askFennec(question: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ASK_FENNEC_EVENT, { detail: { question } }))
}
